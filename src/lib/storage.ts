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

export interface SessionPreset {
    id: string;
    name: string;
    selectedPresetIds: string[];
    config: {
        repeat: number;
        followDelayRatio: number;
        modelId: string;
    };
}

export interface ShadowAudio {
    id?: string; // combination of hashOrXmlId_sentenceIdx_...
    xmlId: number;
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
        const id = `${audio.xmlId}_${audio.sentenceIndex}_${audio.voiceId}_${audio.modelId}_${audio.speed}_${audio.stability}_${audio.similarityBoost}`;
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
        localStorage.setItem('eleven_labs_api_key', key);
    }

    getApiKey(): string | null {
        return localStorage.getItem('eleven_labs_api_key');
    }

    setTheme(themeId: string) {
        localStorage.setItem('shadow_web_theme', themeId);
        document.documentElement.setAttribute('data-theme', themeId);
    }

    getTheme(): string {
        return localStorage.getItem('shadow_web_theme') || 'dark';
    }

    // Session Preset Helpers
    saveSessionPreset(preset: SessionPreset) {
        const presets = this.getSessionPresets();
        const index = presets.findIndex(p => p.id === preset.id);
        if (index >= 0) {
            presets[index] = preset;
        } else {
            presets.push(preset);
        }
        localStorage.setItem('shadow_session_presets', JSON.stringify(presets));
    }

    getSessionPresets(): SessionPreset[] {
        const data = localStorage.getItem('shadow_session_presets');
        return data ? JSON.parse(data) : [];
    }

    deleteSessionPreset(id: string) {
        const presets = this.getSessionPresets().filter(p => p.id !== id);
        localStorage.setItem('shadow_session_presets', JSON.stringify(presets));
    }
}

export const storage = new StorageService();
