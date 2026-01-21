import React, { useState, useEffect } from 'react';
import { Settings, BookOpen, Play, CheckCircle2, Upload, AlertCircle, Trash2, Mic, Volume2, ArrowRight, Save, Layout, Video, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { storage, ShadowSession, ShadowAudio } from './lib/storage';
import { parseShadowXML, ShadowData } from './lib/xmlParser';
import { generateTTSAudio, fetchVoices } from './lib/elevenlabs';
import { ShadowingSession } from './components/ShadowingSession';
import { screenRecorder } from './lib/recorder';

type Screen = 'upload' | 'settings' | 'setup-summary' | 'session' | 'final-summary';

interface VoiceConfig {
    voiceId: string;
    name: string;
    stability: number;
    speed: number;
    repeat: number;
    followDelayRatio: number;
}

function App() {
    const [currentScreen, setCurrentScreen] = useState<Screen>('upload');
    const [xmlData, setXmlData] = useState<ShadowData | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
    const [apiKey, setApiKey] = useState(storage.getApiKey() || '');
    const [voices, setVoices] = useState<any[]>([]);
    const [selectedVoice, setSelectedVoice] = useState<VoiceConfig>({
        voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel
        name: 'Rachel',
        stability: 0.7,
        speed: 1.0,
        repeat: 2,
        followDelayRatio: 1.2
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

    const generateAudioId = (text: string, voiceId: string, speed: number, stability: number) => {
        // Simple hash for text
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        return `ga_${hash}_${voiceId}_${speed}_${stability}`;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target?.result as string;
            try {
                const parsed = parseShadowXML(content);
                setXmlData(parsed);
            } catch (err) { setError("Invalid XML structure"); }
        };
        reader.readAsText(file);
    };

    const handleStartSession = async (record: boolean = false) => {
        if (!xmlData) return;
        setError(null);

        try {
            // 1. Ensure a session exists
            let sessionId = currentSessionId;
            if (!sessionId) {
                sessionId = await storage.saveSession({
                    title: xmlData.title,
                    description: xmlData.description,
                    createdAt: xmlData.createdAt,
                    xmlData: JSON.stringify(xmlData),
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
                screenRecorder.saveRecording(videoBlob, `Shadowing_${xmlData?.title || 'Session'}_${new Date().getTime()}`);
            }
            setIsRecording(false);
        }
        setCurrentScreen('final-summary');
    };

    const startDownload = async () => {
        if (!xmlData || !apiKey) return;
        setIsDownloading(true);
        setDownloadProgress(0);
        setError(null);
        try {
            const sessionId = await storage.saveSession({
                title: xmlData.title,
                description: xmlData.description,
                createdAt: xmlData.createdAt,
                xmlData: JSON.stringify(xmlData),
            });
            setCurrentSessionId(sessionId);
            const total = xmlData.sentences.length;
            for (let i = 0; i < total; i++) {
                const sentence = xmlData.sentences[i];
                const globalId = generateAudioId(sentence.english, selectedVoice.voiceId, selectedVoice.speed, selectedVoice.stability);

                let audioBlob: Blob;
                let duration: number;

                const cached = await storage.getGlobalAudio(globalId);
                if (cached) {
                    audioBlob = cached.audioBlob;
                    duration = cached.duration;
                } else {
                    const audioRes = await generateTTSAudio({
                        text: sentence.english,
                        voiceId: selectedVoice.voiceId,
                        settings: { voiceId: selectedVoice.voiceId, stability: selectedVoice.stability, similarity_boost: 0.75 }
                    });
                    audioBlob = audioRes.blob;
                    duration = audioRes.duration;

                    await storage.saveGlobalAudio({
                        id: globalId,
                        text: sentence.english,
                        voiceId: selectedVoice.voiceId,
                        speed: selectedVoice.speed,
                        stability: selectedVoice.stability,
                        audioBlob: audioBlob,
                        duration: duration
                    });
                }

                await storage.saveAudio({
                    xmlId: sessionId,
                    sentenceIndex: sentence.index,
                    voiceId: selectedVoice.voiceId,
                    speed: selectedVoice.speed,
                    stability: selectedVoice.stability,
                    audioBlob: audioBlob,
                    duration: duration
                });
                setDownloadProgress(Math.round(((i + 1) / total) * 100));
            }
            setCurrentScreen('setup-summary');
        } catch (err: any) { setError(err.message || "Failed to download audio"); } finally { setIsDownloading(false); }
    };

    const getDifficultyWords = () => {
        if (!xmlData) return [];
        const words = xmlData.sentences.flatMap(s => s.words);
        // Unique words based on term, keeping highest difficulty
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
            const parsed = parseShadowXML(content);
            setXmlData(parsed);
        } catch (err) {
            setError("Failed to load sample XML");
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
                <button onClick={() => setCurrentScreen('settings')} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <Settings className="w-6 h-6 text-white/60" />
                </button>
            </header>

            <main className={`w-full z-10 pt-24 pb-12 transition-all duration-500 ${currentScreen === 'session' ? 'max-w-[98%]' : 'max-w-4xl'}`}>
                <AnimatePresence mode="wait">
                    {currentScreen === 'upload' && (
                        <div key="upload-screen-root">
                            <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
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
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {sampleList.map((sample) => (
                                            <button
                                                key={sample.id}
                                                onClick={() => handleSampleSelect(sample.path)}
                                                className={`px-4 py-3 rounded-xl border border-slate-700/50 text-left hover:bg-blue-500/10 hover:border-blue-500/30 transition-all group ${xmlData?.title.includes(sample.name) ? 'bg-blue-500/10 border-blue-500' : 'bg-slate-800/30'}`}
                                            >
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm group-hover:text-blue-400 transition-colors">{sample.name}</span>
                                                    <span className="text-[10px] text-slate-500 italic uppercase tracking-wider">Sample Session</span>
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
                                                <input type="file" accept=".xml" className="hidden" onChange={handleFileUpload} />
                                                Browse XML
                                            </label>
                                            {xmlData && (
                                                <span className="text-xs text-blue-400 font-mono animate-in fade-in slide-in-from-top-1">
                                                    Selected: {xmlData.title}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            </div>

                            {xmlData && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="fixed bottom-10 right-10 z-[60]"
                                >
                                    <button
                                        onClick={() => setCurrentScreen('settings')}
                                        className="group flex items-center gap-4 bg-blue-600 hover:bg-blue-500 text-white px-10 py-5 rounded-2xl font-black text-2xl shadow-2xl shadow-blue-500/40 transition-all hover:scale-110 active:scale-95 ring-4 ring-blue-500/10"
                                    >
                                        Start Configuration
                                        <ArrowRight className="w-8 h-8 group-hover:translate-x-2 transition-transform" />
                                    </button>
                                </motion.div>
                            )}
                        </div>
                    )}

                    {currentScreen === 'settings' && (
                        <motion.div key="settings" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="glass-card p-8 text-white max-w-2xl mx-auto">
                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"> <Settings className="w-6 h-6 text-blue-400" /> Session Settings </h2>
                            <div className="space-y-6">
                                <div>
                                    <label className="text-sm font-medium text-slate-400 block mb-2">ElevenLabs API Key</label>
                                    <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-white" />
                                    <p className="text-[10px] text-slate-500 mt-1 italic">“이 키는 브라우저에만 저장되며 외부로 전송되지 않습니다”</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-2">Voice</label>
                                        <select className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white appearance-none" value={selectedVoice.voiceId} onChange={(e) => setSelectedVoice({ ...selectedVoice, voiceId: e.target.value })}>
                                            {voices.length > 0 ? voices.map(v => (<option key={v.voice_id} value={v.voice_id}>{v.name}</option>)) : <option value="21m00Tcm4TlvDq8ikWAM">Rachel (Default)</option>}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-2">Stability ({selectedVoice.stability})</label>
                                        <input type="range" min="0" max="1" step="0.1" value={selectedVoice.stability} onChange={(e) => setSelectedVoice({ ...selectedVoice, stability: parseFloat(e.target.value) })} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-2">Repeats ({selectedVoice.repeat})</label>
                                        <input type="range" min="1" max="5" value={selectedVoice.repeat} onChange={(e) => setSelectedVoice({ ...selectedVoice, repeat: parseInt(e.target.value) })} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-400 block mb-2">Follow Delay Ratio ({selectedVoice.followDelayRatio}x)</label>
                                        <input type="range" min="0" max="2" step="0.1" value={selectedVoice.followDelayRatio} onChange={(e) => setSelectedVoice({ ...selectedVoice, followDelayRatio: parseFloat(e.target.value) })} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                    </div>
                                </div>
                            </div>
                            {error && (<div className="mt-6 flex items-center gap-2 text-rose-400 bg-rose-400/10 p-4 rounded-xl"> <AlertCircle className="w-5 h-5 flex-shrink-0" /> <p className="text-sm">{error}</p> </div>)}
                            {isDownloading ? (
                                <div className="mt-8 space-y-4">
                                    <div className="flex justify-between items-center text-sm"> <span className="text-slate-400">Downloading Voice Assets...</span> <span className="text-blue-400 font-bold">{downloadProgress}%</span> </div>
                                    <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden"> <motion.div className="bg-blue-600 h-2.5" initial={{ width: 0 }} animate={{ width: `${downloadProgress}%` }} /> </div>
                                </div>
                            ) : (
                                <div className="flex gap-4 mt-8">
                                    <button onClick={() => setCurrentScreen('upload')} className="w-full px-6 py-4 bg-slate-800 border border-slate-700 rounded-xl font-semibold hover:bg-slate-700 transition-colors">Back</button>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* Floating Download Button in Settings Screen */}
                    {currentScreen === 'settings' && !isDownloading && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="fixed bottom-10 right-10 z-[70]"
                        >
                            <button
                                onClick={startDownload}
                                className="group flex items-center gap-4 bg-blue-600 hover:bg-blue-500 text-white px-10 py-5 rounded-2xl font-black text-2xl shadow-2xl shadow-blue-500/40 transition-all hover:scale-110 active:scale-95 ring-4 ring-blue-500/10"
                            >
                                Download Assets
                                <ArrowRight className="w-8 h-8 group-hover:translate-x-2 transition-transform" />
                            </button>
                        </motion.div>
                    )}

                    {
                        currentScreen === 'setup-summary' && xmlData && (
                            <motion.div key="summary" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-8 text-white max-w-2xl mx-auto space-y-8">
                                <div className="flex items-center gap-4 border-b border-slate-700 pb-6">
                                    <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400"> <Layout className="w-8 h-8" /> </div>
                                    <div>
                                        <h2 className="text-2xl font-bold">{xmlData.title}</h2>
                                        <p className="text-slate-400">{xmlData.sentences.length} Sentences ready</p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <label className="text-sm font-medium text-slate-400 block">Session Notes (Optional)</label>
                                    <textarea value={userNote} onChange={(e) => setUserNote(e.target.value)} placeholder="Write something before starting..." className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                                    <div> <p className="text-slate-500">Voice</p> <p className="font-bold">{selectedVoice.name}</p> </div>
                                    <div> <p className="text-slate-500">Repeats / Delay</p> <p className="font-bold">{selectedVoice.repeat}x / {selectedVoice.followDelayRatio}x</p> </div>
                                </div>
                                <div className="flex gap-4">
                                    <button onClick={() => setCurrentScreen('settings')} className="w-full px-6 py-4 bg-slate-800 rounded-xl font-semibold hover:bg-slate-700 transition-colors">Change Configuration</button>
                                </div>
                            </motion.div>
                        )
                    }

                    {/* Floating Start Buttons for Summary Screen */}
                    {currentScreen === 'setup-summary' && xmlData && (
                        <motion.div
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="fixed bottom-10 right-10 flex flex-col items-end gap-4 z-[70]"
                        >
                            <button
                                onClick={() => handleStartSession(true)}
                                className="group flex items-center gap-4 bg-rose-600 hover:bg-rose-500 text-white px-8 py-4 rounded-2xl font-bold text-xl shadow-2xl shadow-rose-500/40 transition-all hover:scale-105 active:scale-95"
                            >
                                <Radio className="w-6 h-6 animate-pulse" />
                                Start & Record
                            </button>
                            <button
                                onClick={() => handleStartSession(false)}
                                className="group flex items-center gap-4 bg-blue-600 hover:bg-blue-500 text-white px-10 py-5 rounded-2xl font-black text-2xl shadow-2xl shadow-blue-500/40 transition-all hover:scale-110 active:scale-95 ring-4 ring-blue-500/10"
                            >
                                Start Session
                                <ArrowRight className="w-8 h-8 group-hover:translate-x-2 transition-transform" />
                            </button>
                        </motion.div>
                    )}

                    {
                        currentScreen === 'session' && xmlData && currentSessionId && (
                            <motion.div key="session" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
                                <ShadowingSession
                                    xmlData={xmlData}
                                    voiceConfig={selectedVoice}
                                    sessionId={currentSessionId}
                                    onFinish={handleSessionFinish}
                                    isRecording={isRecording}
                                    onReadyToRecord={isRecording ? () => screenRecorder.start() : undefined}
                                />
                            </motion.div>
                        )
                    }

                    {
                        currentScreen === 'final-summary' && xmlData && (
                            <motion.div key="final" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-12 text-center text-white max-w-3xl mx-auto space-y-12">
                                <div className="space-y-2">
                                    <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4"> <CheckCircle2 className="w-12 h-12 text-emerald-400" /> </div>
                                    <h2 className="text-4xl font-bold">Session Complete!</h2>
                                    <p className="text-slate-400">Great job! You've completed {xmlData.sentences.length} sentences.</p>
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
                </AnimatePresence>
            </main>

            <footer className="fixed bottom-0 left-0 right-0 p-6 text-center text-sm text-slate-600 pointer-events-none">
                <p>© 2026 Shadowing Web Service</p>
            </footer>
        </div>
    );
}

export default App;
