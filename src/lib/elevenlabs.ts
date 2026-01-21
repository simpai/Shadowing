import { storage } from './storage';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

export interface VoiceSettings {
    voiceId: string;
    stability: number;
    similarity_boost: number;
    style?: number;
    use_speaker_boost?: boolean;
}

export interface TTSRequest {
    text: string;
    voiceId: string;
    settings: VoiceSettings;
}

export const generateTTSAudio = async (req: TTSRequest): Promise<{ blob: Blob; duration: number }> => {
    const apiKey = storage.getApiKey();
    if (!apiKey) throw new Error('API Key is missing');

    const response = await fetch(
        `${ELEVENLABS_API_URL}/text-to-speech/${req.voiceId}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'xi-api-key': apiKey,
            },
            body: JSON.stringify({
                text: req.text,
                model_id: 'eleven_multilingual_v2',
                voice_settings: req.settings,
            }),
        }
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail?.status || `TTS conversion failed: ${response.statusText}`);
    }

    const blob = await response.blob();

    // Get duration using temporary audio element
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    const duration = await new Promise<number>((resolve) => {
        audio.onloadedmetadata = () => {
            resolve(audio.duration);
            URL.revokeObjectURL(url);
        };
        audio.onerror = () => resolve(0); // Fallback
    });

    return { blob, duration };
};

export const fetchVoices = async (): Promise<any[]> => {
    const apiKey = storage.getApiKey();
    if (!apiKey) throw new Error('API Key is missing');

    const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
        headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) throw new Error('Failed to fetch voices');
    const data = await response.json();
    return data.voices;
};
