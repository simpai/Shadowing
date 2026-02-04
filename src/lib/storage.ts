import { openDB, IDBPDatabase } from 'idb';

export interface ShadowSession {
    id?: number;
    title: string;
    description: string;
    createdAt: string;
    completedAt?: string;
    totalSentences?: number;
    rawData: string;
    userNote?: string;
}

export interface AppliedVoice {
    id: string; // Unique ID for this instance
    voiceId: string;
    name: string;
    speed: number;
    repeat: number;
    showTranslation?: boolean;
    showWords?: boolean;
}

export interface SessionPreset {
    id: string;
    name: string;
    appliedVoices: AppliedVoice[];
    config: {
        followDelayRatio: number;
        modelId: string;
    };
}

export interface ShadowAudio {
    id?: string; // combination of sessionId_sentenceIdx_...
    sessionId: number;
    sentenceIndex: number;
    voiceId: string;
    modelId: string;
    speed: number;
    stability: number;
    similarityBoost: number;
    style?: number;
    useSpeakerBoost?: boolean;
    audioBlob: Blob;
    duration: number;
}

export interface GlobalAudio {
    id: string; // textHash_voiceId_speed_stability
    text: string;
    voiceId: string;
    modelId: string;
    speed: number;
    stability: number;
    similarityBoost: number;
    style?: number;
    useSpeakerBoost?: boolean;
    audioBlob: Blob;
    duration: number;
}

const DB_NAME = 'ShadowWebDB';
const DB_VERSION = 2;

class StorageService {
    private dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains('sessions')) {
                db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('audio')) {
                db.createObjectStore('audio', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('global_audio')) {
                db.createObjectStore('global_audio', { keyPath: 'id' });
            }
        },
    });

    async saveSession(session: Omit<ShadowSession, 'id'>): Promise<number> {
        const db = await this.dbPromise;
        return (await db.add('sessions', session)) as number;
    }

    async updateSession(id: number, session: Partial<ShadowSession>): Promise<void> {
        const db = await this.dbPromise;
        const existing = await db.get('sessions', id);
        if (existing) {
            await db.put('sessions', { ...existing, ...session });
        }
    }

    async getSessions(): Promise<ShadowSession[]> {
        const db = await this.dbPromise;
        return db.getAll('sessions');
    }

    async saveAudio(audio: ShadowAudio): Promise<string> {
        const db = await this.dbPromise;
        const id = `${audio.sessionId}_${audio.sentenceIndex}_${audio.voiceId}_${audio.modelId}_${audio.speed}_${audio.stability}_${audio.similarityBoost}`;
        await db.put('audio', { ...audio, id });
        return id;
    }

    async deleteAudio(id: string): Promise<void> {
        const db = await this.dbPromise;
        await db.delete('audio', id);
    }

    async getAudio(id: string): Promise<ShadowAudio | undefined> {
        const db = await this.dbPromise;
        return db.get('audio', id);
    }

    async saveGlobalAudio(audio: GlobalAudio): Promise<void> {
        const db = await this.dbPromise;
        await db.put('global_audio', audio);
    }

    async getGlobalAudio(id: string): Promise<GlobalAudio | undefined> {
        const db = await this.dbPromise;
        return db.get('global_audio', id);
    }

    async getGlobalAudios(): Promise<GlobalAudio[]> {
        const db = await this.dbPromise;
        return db.getAll('global_audio');
    }

    async deleteGlobalAudio(id: string): Promise<void> {
        const db = await this.dbPromise;
        await db.delete('global_audio', id);
    }

    async clearAllAudio(): Promise<void> {
        const db = await this.dbPromise;
        const tx = db.transaction(['audio', 'global_audio'], 'readwrite');
        await Promise.all([
            tx.objectStore('audio').clear(),
            tx.objectStore('global_audio').clear(),
            tx.done
        ]);
    }

    // LocalStorage Helpers
    setApiKey(key: string) {
        if (!key) return;
        localStorage.setItem('eleven_labs_api_key', key);
        // Also save to a "persistent" key that doesn't get cleared as easily by mistake
        localStorage.setItem('shadow_persistent_api_key', key);
    }

    getApiKey(): string | null {
        return localStorage.getItem('eleven_labs_api_key') || localStorage.getItem('shadow_persistent_api_key');
    }

    setTheme(themeId: string) {
        localStorage.setItem('shadow_web_theme', themeId);
        document.documentElement.setAttribute('data-theme', themeId);
    }

    getTheme(): string {
        return localStorage.getItem('shadow_web_theme') || 'dark';
    }

    setFont(fontId: string) {
        localStorage.setItem('shadow_web_font', fontId);
        document.body.style.fontFamily = `'${fontId}', 'Inter', sans-serif`;
    }

    getFont(): string {
        return localStorage.getItem('shadow_web_font') || 'Inter';
    }

    // Session Preset Helpers
    saveSessionPreset(preset: SessionPreset) {
        const presets = this.getSessionPresets(true); // Don't include default here
        const index = presets.findIndex(p => p.id === preset.id);
        if (index >= 0) {
            presets[index] = preset;
        } else {
            presets.push(preset);
        }
        localStorage.setItem('shadow_session_presets', JSON.stringify(presets));
    }

    getSessionPresets(excludeDefault: boolean = false): SessionPreset[] {
        const data = localStorage.getItem('shadow_session_presets');
        let userPresets: SessionPreset[] = [];

        if (data) {
            try {
                const parsed = JSON.parse(data);
                userPresets = parsed.filter((p: any) => Array.isArray(p.appliedVoices));
            } catch (e) {
                console.error("Failed to parse presets", e);
            }
        }

        if (excludeDefault) return userPresets;

        // If no user presets, or specifically requested, provide a default
        const defaultPreset: SessionPreset = {
            id: 'default-preset-1',
            name: 'Standard Practice (Default)',
            appliedVoices: [
                {
                    id: 'default-voice-jake',
                    voiceId: 'pNInz6obpgDQGcFmaJgB', // Jake
                    name: 'Jake',
                    speed: 1.0,
                    repeat: 1,
                    showTranslation: true,
                    showWords: true
                }
            ],
            config: {
                followDelayRatio: 1.2,
                modelId: 'eleven_multilingual_v2'
            }
        };

        return userPresets.length > 0 ? userPresets : [defaultPreset];
    }

    deleteSessionPreset(id: string) {
        const presets = this.getSessionPresets(true).filter(p => p.id !== id);
        localStorage.setItem('shadow_session_presets', JSON.stringify(presets));
    }
}

export const storage = new StorageService();
