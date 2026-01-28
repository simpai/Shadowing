import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { storage } from './storage';

export interface VoiceSettings {
    stability: number;
    similarity_boost: number;
    style?: number;
    use_speaker_boost?: boolean;
    speed?: number;
}

export interface TTSRequest {
    text: string;
    voiceId: string;
    modelId: string;
    settings: VoiceSettings;
}

// Create a function to get the ElevenLabs client instance
const getClient = (): ElevenLabsClient => {
    const apiKey = storage.getApiKey();
    if (!apiKey) throw new Error('API Key is missing');

    return new ElevenLabsClient({
        apiKey: apiKey,
    });
};

export const generateTTSAudio = async (req: TTSRequest): Promise<{ blob: Blob; duration: number }> => {
    const client = getClient();

    try {
        // Use the SDK's textToSpeech.convert method
        const audioStream = await client.textToSpeech.convert(req.voiceId, {
            text: req.text,
            modelId: req.modelId,
            voiceSettings: {
                stability: req.settings.stability,
                similarityBoost: req.settings.similarity_boost,
                style: req.settings.style,
                useSpeakerBoost: req.settings.use_speaker_boost,
                // Clamp speed between 0.7 and 1.2 as supported by ElevenLabs API
                speed: req.settings.speed ? Math.max(0.7, Math.min(1.2, req.settings.speed)) : undefined,
            },
        });

        // Convert ReadableStream to Blob using Response API
        const response = new Response(audioStream);
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
    } catch (error: any) {
        // Handle SDK errors
        const errorMessage = error?.message || error?.body?.detail?.message || 'TTS conversion failed';
        throw new Error(errorMessage);
    }
};

export const fetchVoices = async (): Promise<any[]> => {
    const client = getClient();

    try {
        const fetchPromise = client.voices.search();
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Voice fetch timeout (10s)')), 10000)
        );

        const response: any = await Promise.race([fetchPromise, timeoutPromise]);
        return response.voices || [];
    } catch (error: any) {
        const errorMessage = error?.message || 'Failed to fetch voices';
        throw new Error(errorMessage);
    }
};

