import { openDB, IDBPDatabase } from 'idb';

export interface ShadowSession {
    id?: number;
    title: string;
    description: string;
    createdAt: string;
    xmlData: string;
    userNote?: string;
}

export interface ShadowAudio {
    id?: string; // combination of hashOrXmlId_sentenceIdx_...
    xmlId: number;
    sentenceIndex: number;
    voiceId: string;
    speed: number;
    stability: number;
    audioBlob: Blob;
    duration: number;
}

export interface GlobalAudio {
    id: string; // textHash_voiceId_speed_stability
    text: string;
    voiceId: string;
    speed: number;
    stability: number;
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

    async getSessions(): Promise<ShadowSession[]> {
        const db = await this.dbPromise;
        return db.getAll('sessions');
    }

    async saveAudio(audio: ShadowAudio): Promise<string> {
        const db = await this.dbPromise;
        const id = `${audio.xmlId}_${audio.sentenceIndex}_${audio.voiceId}_${audio.speed}_${audio.stability}`;
        await db.put('audio', { ...audio, id });
        return id;
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
}

export const storage = new StorageService();
