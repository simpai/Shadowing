import React, { useState, useEffect } from 'react';
import { Settings, BookOpen, Play, CheckCircle2, Upload, AlertCircle, Trash2, Mic, Volume2, ArrowRight, Save, Layout, Video, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { storage, ShadowSession, ShadowAudio } from './lib/storage';
import { parseShadowXML, parseShadowJSON, ShadowData } from './lib/dataParser';
import { generateTTSAudio, fetchVoices } from './lib/elevenlabs';
import { ShadowingSession } from './components/ShadowingSession';
import { screenRecorder } from './lib/recorder';
import voicePresets from './config/voicePresets.json';

import { StorageManager } from './components/StorageManager';

type Screen = 'upload' | 'settings' | 'setup-summary' | 'session' | 'final-summary' | 'storage-manager';

interface VoiceConfig {
    voiceId: string;
    name: string;
    similarityBoost: number;
    speed: number;
    repeat: number;
    followDelayRatio: number;
    style?: number;
    useSpeakerBoost?: boolean;
}

function App() {
    const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);
    const [currentScreen, setCurrentScreen] = useState<Screen>('upload');
    const [sessionData, setSessionData] = useState<ShadowData | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
    const [apiKey, setApiKey] = useState(storage.getApiKey() || '');
    const [voices, setVoices] = useState<any[]>([]);
    const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([voicePresets[0].id]);
    const [globalConfig, setGlobalConfig] = useState({
        repeat: 2,
        followDelayRatio: 1.2,
        modelId: 'eleven_multilingual_v2'
    });
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [userNote, setUserNote] = useState('');
    const [isRecording, setIsRecording] = useState(false);

    useEffect(() => {
        const styleId = 'hide-cursor-style';
        if (isRecording) {
            let style = document.getElementById(styleId);
            if (!style) {
                style = document.createElement('style');
                style.id = styleId;
                style.innerHTML = '* { cursor: none !important; }';
                document.head.appendChild(style);
            }
        } else {
            const style = document.getElementById(styleId);
            if (style) style.remove();
        }
    }, [isRecording]);

    const [sampleList, setSampleList] = useState<any[]>([]);

    useEffect(() => {
        if (apiKey) {
            storage.setApiKey(apiKey);
            fetchVoices().then(setVoices).catch(e => console.error("Failed to load voices", e));
        }
        // Fetch samples
        fetch('/samples/index.json')
            .then(res => res.json())
            .then(setSampleList)
            .catch(e => console.error("Failed to load sample index", e));
    }, [apiKey]);

    const generateAudioId = (text: string, voiceId: string, speed: number, stability: number, similarityBoost: number, modelId: string, style: number = 0, speakerBoost: boolean = true) => {
        // Simple hash for text
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        return `ga_${hash}_${voiceId}_${speed}_${stability}_${similarityBoost}_${modelId}_${style}_${speakerBoost}`;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target?.result as string;
            try {
                if (file.name.toLowerCase().endsWith('.json')) {
                    const parsed = parseShadowJSON(content);
                    setSessionData(parsed);
                } else {
                    const parsed = parseShadowXML(content);
                    setSessionData(parsed);
                }
            } catch (err) { setError("Invalid file structure. Make sure it is valid JSON or XML."); }
        };
        reader.readAsText(file);
    };

    const handleStartSession = async (record: boolean = false) => {
        if (!sessionData) return;
        setError(null);

        try {
            // 1. Ensure a session exists
            let sessionId = currentSessionId;
            if (!sessionId) {
                sessionId = await storage.saveSession({
                    title: sessionData.title,
                    description: sessionData.description,
                    createdAt: sessionData.createdAt,
                    rawData: JSON.stringify(sessionData),
                });
                setCurrentSessionId(sessionId);
            }

            // 2. Prepare Recording State (UI hiding)
            setIsRecording(record);

            // 3. Switch to session screen immediately
            setCurrentScreen('session');
        } catch (err) {
            console.error("Failed to start session:", err);
            setError("Could not initialize session. Please try again.");
            setIsRecording(false);
        }
    };

    const handleSessionFinish = async () => {
        if (isRecording) {
            const videoBlob = await screenRecorder.stop();
            if (videoBlob) {
                screenRecorder.saveRecording(videoBlob, `Shadowing_${sessionData?.title || 'Session'}_${new Date().getTime()}`);
            }
            setIsRecording(false);
        }
        if (!sessionData || !currentSessionId) return;
        try {
            await storage.updateSession(currentSessionId, {
                completedAt: new Date().toISOString(),
                totalSentences: sessionData.sentences.length
            });
            setCurrentScreen('final-summary');
        } catch (err) { console.error("Failed to finish session", err); }
    };

    const startDownload = async () => {
        if (!sessionData || !apiKey) return;
        setIsDownloading(true);
        setDownloadProgress(0);
        setError(null);
        try {
            const sessionId = await storage.saveSession({
                title: sessionData.title,
                description: sessionData.description,
                createdAt: sessionData.createdAt,
                rawData: JSON.stringify(sessionData),
            });
            setCurrentSessionId(sessionId);
            const total = sessionData.sentences.length;
            for (let i = 0; i < total; i++) {
                const sentence = sessionData.sentences[i];
                const stability = sentence.stability ?? 0.5;

                for (const presetId of selectedPresetIds) {
                    const preset = voicePresets.find(p => p.id === presetId);
                    if (!preset) continue;

                    const voiceId = preset.voiceId;

                    const globalId = generateAudioId(
                        sentence.english,
                        voiceId,
                        preset.speed,
                        stability,
                        preset.similarity_boost,
                        globalConfig.modelId,
                        preset.style,
                        preset.use_speaker_boost
                    );

                    let audioBlob: Blob;
                    let duration: number;

                    const cached = await storage.getGlobalAudio(globalId);
                    if (cached) {
                        audioBlob = cached.audioBlob;
                        duration = cached.duration;
                    } else {
                        const audioRes = await generateTTSAudio({
                            text: sentence.english,
                            voiceId: voiceId,
                            modelId: globalConfig.modelId,
                            settings: {
                                stability: stability,
                                similarity_boost: preset.similarity_boost,
                                style: preset.style,
                                use_speaker_boost: preset.use_speaker_boost,
                                speed: preset.speed
                            }
                        });
                        audioBlob = audioRes.blob;
                        duration = audioRes.duration;

                        await storage.saveGlobalAudio({
                            id: globalId,
                            text: sentence.english,
                            voiceId: voiceId,
                            modelId: globalConfig.modelId,
                            speed: preset.speed,
                            stability: stability,
                            similarityBoost: preset.similarity_boost,
                            style: preset.style,
                            useSpeakerBoost: preset.use_speaker_boost,
                            audioBlob: audioBlob,
                            duration: duration
                        });
                    }

                    await storage.saveAudio({
                        xmlId: sessionId,
                        sentenceIndex: sentence.index,
                        voiceId: voiceId,
                        modelId: globalConfig.modelId,
                        speed: preset.speed,
                        stability: stability,
                        similarityBoost: preset.similarity_boost,
                        style: preset.style,
                        useSpeakerBoost: preset.use_speaker_boost,
                        audioBlob: audioBlob,
                        duration: duration
                    });
                }
                setDownloadProgress(Math.round(((i + 1) / total) * 100));
            }
            setCurrentScreen('setup-summary');
        } catch (err: any) { setError(err.message || "Failed to download audio"); } finally { setIsDownloading(false); }
    };

    const getDifficultyWords = () => {
        if (!sessionData) return [];
        const words = sessionData.sentences.flatMap(s => s.words);
        const unique = new Map<string, number>();
        words.forEach(w => {
            const current = unique.get(w.term) || 0;
            if (w.difficulty > current) unique.set(w.term, w.difficulty);
        });
        return Array.from(unique.entries())
            .map(([term, diff]) => ({ term, diff }))
            .sort((a, b) => b.diff - a.diff);
    };

    const handleSampleSelect = async (samplePath: string) => {
        try {
            const response = await fetch(samplePath);
            const content = await response.text();
            if (samplePath.toLowerCase().endsWith('.json')) {
                setSessionData(parseShadowJSON(content));
            } else {
                setSessionData(parseShadowXML(content));
            }
        } catch (err) {
            setError("Failed to load sample data");
        }
    };

    return (
        <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-4">
            <div className="absolute inset-0 z-0 bg-slate-950">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
            </div>

            <header className={`fixed top-0 left-0 right-0 p-6 flex justify-between items-center z-50 transition-all duration-700 ease-in-out ${isRecording ? 'opacity-0 -translate-y-8 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.location.reload()}>
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <BookOpen className="text-white w-6 h-6" />
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-white">ShadowWeb</h1>
                </div>
            </header>

            <main className={`w-full z-10 pt-24 pb-12 transition-all duration-500 ${(currentScreen === 'session' || currentScreen === 'upload') ? 'max-w-[98%]' : 'max-w-4xl'}`}>
                <AnimatePresence mode="wait">
                    {currentScreen === 'upload' && (
                        <div key="upload-screen-root">
                            <div className="flex flex-col gap-6 w-full px-4">
                                {/* Samples Section First */}
                                <motion.div
                                    initial={{ opacity: 0, y: -20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="glass-card p-6 text-white"
                                >
                                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                        <Layout className="w-5 h-5 text-blue-400" />
                                        Try Samples
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                                        {sampleList.map((sample) => (
                                            <button
                                                key={sample.id}
                                                onClick={() => handleSampleSelect(sample.path)}
                                                className={`px-4 py-4 rounded-xl border border-slate-700/50 text-left hover:bg-blue-500/10 hover:border-blue-500/30 transition-all group ${sessionData?.title.includes(sample.name) ? 'bg-blue-500/10 border-blue-500' : 'bg-slate-800/30'}`}
                                            >
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-bold text-sm group-hover:text-blue-400 transition-colors line-clamp-1">{sample.name}</span>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] text-slate-500 italic uppercase tracking-wider">Sample</span>
                                                        <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>

                                {/* Simplified Upload Section Second */}
                                <motion.div
                                    key="upload-card"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 1.05 }}
                                    className="glass-card p-6 text-white"
                                >
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                                        <div className="flex items-center gap-4 text-left">
                                            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                                                <Upload className="text-blue-400 w-6 h-6" />
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-bold">Use Custom XML</h2>
                                                <p className="text-sm text-slate-400">Upload your own learning data.</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-center sm:items-end gap-2 shrink-0">
                                            <label className="btn-primary bg-slate-800 border border-slate-700 hover:bg-slate-700 px-6 py-2 cursor-pointer transition-all">
                                                <input type="file" accept=".xml,.json" className="hidden" onChange={handleFileUpload} />
                                                Browse File (JSON/XML)
                                            </label>
                                        </div>
                                        {sessionData && (
                                            <span className="text-xs text-blue-400 font-mono animate-in fade-in slide-in-from-top-1">
                                                Selected: {sessionData.title}
                                            </span>
                                        )}
                                    </div>
                                </motion.div>
                            </div>

                            {/* Storage Manager FAB */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="fixed bottom-10 left-10 z-[60]"
                            >
                                <button
                                    onClick={() => setCurrentScreen('storage-manager')}
                                    className="flex items-center gap-3 p-4 pr-6 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-2xl shadow-2xl border border-slate-700 transition-all hover:scale-110 active:scale-95 group"
                                >
                                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                                        <Trash2 className="w-5 h-5" />
                                    </div>
                                    <span className="text-sm font-bold tracking-tight">Manage Storage</span>
                                </button>
                            </motion.div>
                        </div>
                    )}

                    {currentScreen === 'settings' && (
                        <motion.div key="settings" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="glass-card p-8 pb-32 text-white max-w-2xl mx-auto">
                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"> <Settings className="w-6 h-6 text-blue-400" /> Session Settings </h2>
                            <div className="space-y-6">
                                <div>
                                    <label className="text-sm font-medium text-slate-400 block mb-2">ElevenLabs API Key</label>
                                    <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-white" />
                                    <p className="text-[10px] text-slate-500 mt-1 italic">"이 키는 브라우저에만 저장되며 외부로 전송되지 않습니다"</p>
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-3">Select Actors (Multiple Support)</label>
                                        <div className="grid grid-cols-1 gap-2">
                                            {voicePresets.map((p) => {
                                                const isSelected = selectedPresetIds.includes(p.id);
                                                return (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => {
                                                            if (isSelected) {
                                                                if (selectedPresetIds.length > 1) {
                                                                    setSelectedPresetIds(selectedPresetIds.filter(id => id !== p.id));
                                                                }
                                                            } else {
                                                                setSelectedPresetIds([...selectedPresetIds, p.id]);
                                                            }
                                                        }}
                                                        className={`flex items-center gap-3 p-2 rounded-lg border transition-all text-left ${isSelected ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/10' : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50'}`}
                                                    >
                                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-600'}`}>
                                                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex justify-between items-center mb-1">
                                                                <p className="font-bold text-sm text-white">{p.name}</p>
                                                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                                    <span className="text-[10px] text-slate-400 font-mono">{p.speed}x</span>
                                                                    <input
                                                                        type="range" min="0.7" max="1.2" step="0.05"
                                                                        value={p.speed}
                                                                        onChange={(e) => {
                                                                            const val = parseFloat(e.target.value);
                                                                            p.speed = val; // Direct mutation of import for now, or we can state-ify if needed
                                                                            // Actually we should probably use a state for presets if we want to edit them
                                                                            forceUpdate();
                                                                        }}
                                                                        className="w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <p className="text-[10px] text-slate-500 line-clamp-1">{p.description}</p>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-3">Model Selection</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: 'eleven_multilingual_v2', name: 'Multilingual v2', desc: 'Highest Quality (Standard)' },
                                                { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5', desc: 'High Quality, Low Latency' },
                                                { id: 'eleven_flash_v2_5', name: 'Flash v2.5', desc: 'Fastest & Cheapest' }
                                            ].map(m => (
                                                <button
                                                    key={m.id}
                                                    onClick={() => setGlobalConfig({ ...globalConfig, modelId: m.id })}
                                                    className={`p-3 rounded-xl border transition-all text-left ${globalConfig.modelId === m.id ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/10' : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50'}`}
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="font-bold text-sm text-white">{m.name}</span>
                                                        {globalConfig.modelId === m.id && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                                                    </div>
                                                    <p className="text-[10px] text-slate-500">{m.desc}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    {/* Global speed setting removed */}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-2">Repeats ({globalConfig.repeat})</label>
                                        <input type="range" min="1" max="5" value={globalConfig.repeat} onChange={(e) => setGlobalConfig({ ...globalConfig, repeat: parseInt(e.target.value) })} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-2">Follow Delay Ratio ({globalConfig.followDelayRatio}x)</label>
                                        <input type="range" min="0" max="2" step="0.1" value={globalConfig.followDelayRatio} onChange={(e) => setGlobalConfig({ ...globalConfig, followDelayRatio: parseFloat(e.target.value) })} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                    </div>
                                </div>
                            </div>
                            {error && (<div className="mt-6 flex items-center gap-2 text-rose-400 bg-rose-400/10 p-4 rounded-xl"> <AlertCircle className="w-5 h-5 flex-shrink-0" /> <p className="text-sm">{error}</p> </div>)}
                            {isDownloading && (
                                <div className="mt-8 space-y-4">
                                    <div className="flex justify-between items-center text-sm"> <span className="text-slate-400">Downloading Voice Assets...</span> <span className="text-blue-400 font-bold">{downloadProgress}%</span> </div>
                                    <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden"> <motion.div className="bg-blue-600 h-2.5" initial={{ width: 0 }} animate={{ width: `${downloadProgress}%` }} /> </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {currentScreen === 'settings' && !isDownloading && (
                        <>
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="fixed bottom-10 left-10 z-[70]"
                            >
                                <button
                                    onClick={() => setCurrentScreen('upload')}
                                    className="flex items-center gap-3 p-4 pr-6 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-2xl shadow-2xl border border-slate-700 transition-all hover:scale-110 active:scale-95 group"
                                >
                                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                                        <ArrowRight className="w-6 h-6 rotate-180" />
                                    </div>
                                    <span className="text-sm font-bold tracking-tight">Back to Upload</span>
                                </button>
                            </motion.div>
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="fixed bottom-10 right-10 z-[70]"
                            >
                                <button
                                    onClick={startDownload}
                                    className="flex items-center gap-3 p-4 pr-6 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl shadow-2xl shadow-blue-500/30 border border-blue-400/30 transition-all hover:scale-110 active:scale-95 group"
                                >
                                    <div className="w-10 h-10 bg-blue-700 rounded-xl flex items-center justify-center">
                                        <Save className="w-6 h-6" />
                                    </div>
                                    <span className="text-lg font-black tracking-tight">Download Assets</span>
                                </button>
                            </motion.div>
                        </>
                    )}

                    {currentScreen === 'upload' && sessionData && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="fixed bottom-10 right-10 z-[60]"
                        >
                            <button
                                onClick={() => setCurrentScreen('settings')}
                                className="flex items-center gap-3 p-4 pr-6 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl shadow-2xl shadow-blue-500/30 border border-blue-400/30 transition-all hover:scale-110 active:scale-95 group"
                            >
                                <div className="w-10 h-10 bg-blue-700 rounded-xl flex items-center justify-center">
                                    <ArrowRight className="w-6 h-6" />
                                </div>
                                <span className="text-lg font-black tracking-tight">Start Configuration</span>
                            </button>
                        </motion.div>
                    )}

                    {/* Floating Download Button in Settings Screen */}
                    {/* This section is now handled by the combined fragment above */}

                    {
                        currentScreen === 'setup-summary' && sessionData && (
                            <motion.div key="summary" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-8 text-white max-w-2xl mx-auto space-y-8">
                                <div className="flex items-center gap-4 border-b border-slate-700 pb-6">
                                    <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400"> <Layout className="w-8 h-8" /> </div>
                                    <div>
                                        <h2 className="text-2xl font-bold">{sessionData.title}</h2>
                                        <p className="text-slate-400">{sessionData.sentences.length} Sentences ready</p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <label className="text-sm font-medium text-slate-400 block">Session Notes (Optional)</label>
                                    <textarea value={userNote} onChange={(e) => setUserNote(e.target.value)} placeholder="Write something before starting..." className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                                    <div> <p className="text-slate-500">Actors</p> <p className="font-bold">{selectedPresetIds.length} Selected</p> </div>
                                    <div> <p className="text-slate-500">Repeats / Delay</p> <p className="font-bold">{globalConfig.repeat}x / {globalConfig.followDelayRatio}x</p> </div>
                                </div>
                                {/* Inline configuration button removed for FAB consistency */}
                            </motion.div>
                        )
                    }

                    {/* Floating Start Buttons for Summary Screen */}
                    {
                        currentScreen === 'setup-summary' && sessionData && (
                            <>
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="fixed bottom-10 left-10 z-[70]"
                                >
                                    <button
                                        onClick={() => setCurrentScreen('settings')}
                                        className="flex items-center gap-3 p-4 pr-6 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-2xl shadow-2xl border border-slate-700 transition-all hover:scale-110 active:scale-95 group"
                                    >
                                        <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                                            <ArrowRight className="w-6 h-6 rotate-180" />
                                        </div>
                                        <span className="text-sm font-bold tracking-tight">Change Config</span>
                                    </button>
                                </motion.div>
                                <div className="fixed bottom-10 right-10 flex flex-col items-end gap-4 z-[70]">
                                    <button
                                        onClick={() => handleStartSession(true)}
                                        className="flex items-center gap-3 p-4 pr-6 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl shadow-2xl shadow-rose-500/30 border border-rose-400/30 transition-all hover:scale-110 active:scale-95 group"
                                    >
                                        <div className="w-10 h-10 bg-rose-700 rounded-xl flex items-center justify-center">
                                            <Radio className="w-6 h-6 animate-pulse" />
                                        </div>
                                        <span className="text-lg font-black tracking-tight">Start & Record</span>
                                    </button>
                                    <button
                                        onClick={() => handleStartSession(false)}
                                        className="flex items-center gap-3 p-4 pr-6 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl shadow-2xl shadow-blue-500/30 border border-blue-400/30 transition-all hover:scale-110 active:scale-95 group"
                                    >
                                        <div className="w-10 h-10 bg-blue-700 rounded-xl flex items-center justify-center">
                                            <ArrowRight className="w-6 h-6" />
                                        </div>
                                        <span className="text-lg font-black tracking-tight">Start Session</span>
                                    </button>
                                </div>
                            </>
                        )
                    }

                    {
                        currentScreen === 'session' && sessionData && currentSessionId && (
                            <motion.div key="session" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
                                <ShadowingSession
                                    sessionData={sessionData}
                                    presetIds={selectedPresetIds}
                                    globalConfig={globalConfig}
                                    sessionId={currentSessionId}
                                    onFinish={handleSessionFinish}
                                    isRecording={isRecording}
                                    onReadyToRecord={isRecording ? () => screenRecorder.start() : undefined}
                                />
                            </motion.div>
                        )
                    }

                    {
                        currentScreen === 'final-summary' && sessionData && (
                            <motion.div key="final" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-12 text-center text-white max-w-3xl mx-auto space-y-12">
                                <div className="space-y-2">
                                    <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4"> <CheckCircle2 className="w-12 h-12 text-emerald-400" /> </div>
                                    <h2 className="text-4xl font-bold">Session Complete!</h2>
                                    <p className="text-slate-400">Great job! You've completed {sessionData.sentences.length} sentences.</p>
                                </div>

                                <div className="text-left space-y-6">
                                    <h3 className="text-xl font-bold border-b border-slate-700 pb-2">Vocabulary Check (Difficulty ≥ 3)</h3>
                                    <div className="flex flex-wrap gap-3">
                                        {getDifficultyWords().filter(w => w.diff >= 3).map((w, i) => (
                                            <span key={i} className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-full text-sm font-medium">
                                                {w.term} <span className="text-blue-400 ml-1">({w.diff})</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-8">
                                    <button onClick={() => window.location.reload()} className="btn-primary bg-blue-600 px-12 py-4"> Return Home </button>
                                </div>
                            </motion.div>
                        )
                    }
                    {
                        currentScreen === 'storage-manager' && (
                            <motion.div
                                key="storage-manager"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.05 }}
                            >
                                <StorageManager onBack={() => setCurrentScreen('upload')} />
                            </motion.div>
                        )
                    }
                </AnimatePresence>
            </main>

            <footer className="fixed bottom-0 left-0 right-0 p-6 text-center text-sm text-slate-600 pointer-events-none">
                <p>© 2026 Shadowing Web Service</p>
            </footer>
        </div>
    );
}

export default App;
