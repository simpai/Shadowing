import React, { useState, useEffect } from 'react';
import { Settings, BookOpen, CheckCircle2, Upload, Trash2, ArrowRight, Save, Layout, Radio, Download, Type, Key, Eye, EyeOff, Plus, X, ChevronUp, ChevronDown, Volume2, Compass, Globe, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { storage, ShadowSession, ShadowAudio, AppliedVoice, SessionPreset } from './lib/storage';
import { parseShadowJSON, ShadowData } from './lib/dataParser';
import { generateTTSAudio, fetchVoices } from './lib/elevenlabs';
import { ShadowingSession } from './components/ShadowingSession';
import { screenRecorder } from './lib/recorder';
import voicePresets from './config/voicePresets.json';

import { StorageManager } from './components/StorageManager';
import { LectureIndex } from './components/LectureIndex';

type Screen = 'lecture-index' | 'upload' | 'setup-summary' | 'session' | 'final-summary' | 'storage-manager';


function App() {
    const [currentScreen, setCurrentScreen] = useState<Screen>('lecture-index');
    const [isAuthorized, setIsAuthorized] = useState(!!storage.getAuthToken());
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [authCode, setAuthCode] = useState('');
    const [authError, setAuthError] = useState('');
    const [isCheckingAuth, setIsCheckingAuth] = useState(false);

    const [sessionData, setSessionData] = useState<ShadowData | null>(null);
    const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
    const [apiKey, setApiKey] = useState(storage.getApiKey() || '');
    const [voices, setVoices] = useState<any[]>([]);
    const [appliedVoices, setAppliedVoices] = useState<AppliedVoice[]>([]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [sessionPresets, setSessionPresets] = useState(storage.getSessionPresets());
    const [activePresetId, setActivePresetId] = useState<string | null>(null);
    const [globalConfig, setGlobalConfig] = useState({
        followDelayRatio: 1.2,
        modelId: 'eleven_multilingual_v2'
    });
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [userNote, setUserNote] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [activeSessionPath, setActiveSessionPath] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState('all');
    const [fontFamily, setFontFamily] = useState(storage.getFont());
    const [voiceError, setVoiceError] = useState<string | null>(null);
    const [audioError, setAudioError] = useState<string | null>(null);
    const [showApiKey, setShowApiKey] = useState(false);
    const [isAutomatedSession, setIsAutomatedSession] = useState(false);
    const [selectedFilter, setSelectedFilter] = useState<string>('All');

    const addAppliedVoice = (preset: any) => {
        const newVoice: AppliedVoice = {
            id: Math.random().toString(36).substring(2, 11),
            voiceId: preset.voiceId,
            name: preset.name.split(' — ')[0].split(' - ')[0], // Simplify name
            speed: 1.0,
            repeat: 1,
            showTranslation: true,
            showWords: true
        };
        setAppliedVoices([...appliedVoices, newVoice]);
    };

    const updateAppliedVoice = (id: string, updates: Partial<AppliedVoice>) => {
        setAppliedVoices(appliedVoices.map(v => v.id === id ? { ...v, ...updates } : v));
    };

    const removeAppliedVoice = (id: string) => {
        setAppliedVoices(appliedVoices.filter(v => v.id !== id));
    };

    const moveVoice = (index: number, direction: 'up' | 'down') => {
        const newVoices = [...appliedVoices];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newVoices.length) return;
        [newVoices[index], newVoices[targetIndex]] = [newVoices[targetIndex], newVoices[index]];
        setAppliedVoices(newVoices);
    };

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

    const [sessionList, setSessionList] = useState<any[]>([]);

    useEffect(() => {
        storage.setFont(fontFamily);
    }, [fontFamily]);

    const handleCheckAuth = async () => {
        setIsCheckingAuth(true);
        setAuthError('');
        try {
            const res = await fetch('/api/check-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: authCode })
            });
            const data = await res.json();
            if (data.success) {
                storage.setAuthToken(data.token);
                setIsAuthorized(true);
                setIsAuthModalOpen(false);
                setCurrentScreen('upload'); // Redirect to library after successful auth
            } else {
                setAuthError(data.message || 'Invalid access code.');
            }
        } catch (err) {
            setAuthError('Failed to verify code. Please try again.');
        } finally {
            setIsCheckingAuth(false);
        }
    };

    const handleEnterLibrary = () => {
        if (isAuthorized) {
            setCurrentScreen('upload');
        } else {
            setIsAuthModalOpen(true);
        }
    };

    useEffect(() => {
        // 1. Handle API Key from external file (persistent)
        fetch('/userConfig.json')
            .then(res => res.json())
            .then(config => {
                if (config.apiKey && !apiKey) {
                    setApiKey(config.apiKey);
                    storage.setApiKey(config.apiKey);
                    console.log("[App] API Key loaded from userConfig.json");
                }
            })
            .catch(() => {/* Ignore if file doesn't exist or is invalid */ });

        // 2. Handle API Key from Storage or Query Params
        const params = new URLSearchParams(window.location.search);
        const urlApiKey = params.get('apiKey');
        const finalKey = urlApiKey || storage.getApiKey() || '';

        if (finalKey) {
            setApiKey(finalKey);
            storage.setApiKey(finalKey);
        }
    }, []);

    // Fetch voices when apiKey is available
    useEffect(() => {
        if (apiKey) {
            setVoiceError(null);
            fetchVoices()
                .then(v => {
                    if (v && v.length > 0) {
                        setVoices(v);
                    } else {
                        setVoiceError("No voices returned from API");
                    }
                })
                .catch(e => {
                    console.error("Failed to load voices", e);
                    const isPermissionError = e.message?.includes('missing_permissions') || e.message?.includes('401');

                    if (isPermissionError) {
                        // Fallback to presets if we can't fetch the list
                        const fallbackVoices = voicePresets.map(p => ({
                            voice_id: p.voiceId,
                            name: p.name,
                            preview_url: '', // Not needed for logic
                            category: 'generated'
                        }));
                        setVoices(fallbackVoices);
                        setVoiceError("Using default voices (API key lacks listing permission)");
                    } else {
                        setVoiceError(e.message || "Failed to load voices");
                    }
                });
        }
    }, [apiKey]);

    // Handle Autoload via Query Params
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const sessionUrl = params.get('sessionUrl');
        const autoStart = params.get('autoStart') === 'true';

        if (sessionUrl) {
            fetch(sessionUrl)
                .then(res => res.json())
                .then(data => {
                    const parsed = parseShadowJSON(JSON.stringify(data));
                    setSessionData(parsed);
                    if (!autoStart) {
                        setCurrentScreen('setup-summary');
                    }
                })
                .catch(err => console.error("Failed to autoload session:", err));
        }
    }, []);

    // Automation Trigger
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const autoStart = params.get('autoStart') === 'true';

        if (autoStart && sessionData && currentScreen === 'upload') {
            const runAutomation = async () => {
                // Ensure we don't trigger multiple times
                if (isDownloading) return;

                // IMPORTANT: Wait for API key and voices to be ready
                if (!apiKey || voices.length === 0) return;

                let currentVoices = appliedVoices;
                if (currentVoices.length === 0) {
                    const presets = storage.getSessionPresets();
                    if (presets.length > 0) {
                        currentVoices = presets[0].appliedVoices;
                        setAppliedVoices(currentVoices);
                    } else {
                        // Hard fallback if storage fails
                        const defaultVoice: AppliedVoice = {
                            id: 'auto-voice-1',
                            voiceId: 'pNInz6obpgDQGcFmaJgB', // Jake
                            name: 'Jake',
                            speed: 1.0,
                            repeat: 1
                        };
                        setAppliedVoices([defaultVoice]);
                        currentVoices = [defaultVoice];
                    }
                }

                const result = await startDownload(currentVoices);
                if (result) {
                    // CLEAR URL PARAMS to prevent infinite loop on return
                    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                    window.history.replaceState({ path: newUrl }, '', newUrl);

                    const sessionId = typeof result === 'number' ? result : undefined;
                    import('./lib/recorder').then(({ screenRecorder }) => {
                        screenRecorder.setAutomationMode(true);
                        setIsAutomatedSession(true);
                        handleStartSession(true, sessionData, sessionId);
                    });
                }
            };
            runAutomation();
        }
    }, [sessionData, voices, apiKey, currentScreen, isDownloading, appliedVoices]);

    // Fetch sessions index
    useEffect(() => {
        fetch('/index.json')
            .then(res => res.json())
            .then(setSessionList)
            .catch(e => console.error("Failed to load session index", e));
    }, []);

    const generateAudioId = (text: string, voiceId: string, speed: number, stability: number, similarityBoost: number, modelId: string, style: number = 0, speakerBoost: boolean = true) => {
        // Simple hash for text
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        return `ga_${hash}_${voiceId}_${speed}_${stability}_${similarityBoost}_${modelId}_${style}_${speakerBoost}`;
    };

    useEffect(() => {
        if (activePresetId) {
            const preset = sessionPresets.find(p => p.id === activePresetId);
            if (preset) {
                setAppliedVoices(preset.appliedVoices);
                setGlobalConfig(preset.config);
            }
        }
    }, [activePresetId, sessionPresets]);

    // Auto-select first preset if none active
    useEffect(() => {
        if (!activePresetId && sessionPresets.length > 0) {
            setActivePresetId(sessionPresets[0].id);
        }
    }, [sessionPresets, activePresetId]);

    // Auto-download on summary screen
    useEffect(() => {
        if (currentScreen === 'setup-summary' && sessionData && apiKey && !isDownloading && downloadProgress < 100) {
            startDownload();
        }
    }, [currentScreen, sessionData, apiKey]);

    const handleSavePreset = () => {
        const name = prompt('Enter preset name:');
        if (!name) return;

        const newPreset = {
            id: Date.now().toString(),
            name,
            appliedVoices,
            config: globalConfig
        };

        storage.saveSessionPreset(newPreset);
        const updated = storage.getSessionPresets();
        setSessionPresets(updated);
        setActivePresetId(newPreset.id);
    };

    const handleDeletePreset = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Delete this preset?')) return;
        storage.deleteSessionPreset(id);
        const updated = storage.getSessionPresets();
        setSessionPresets(updated);
        if (activePresetId === id) setActivePresetId(null);
    };

    const handleExportPreset = (preset: SessionPreset, e: React.MouseEvent) => {
        e.stopPropagation();
        const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shadow_preset_${preset.name.replace(/\s+/g, '_').toLowerCase()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImportPreset = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const content = event.target?.result as string;
                const preset = JSON.parse(content) as SessionPreset;

                // Basic validation
                if (!preset.name || !Array.isArray(preset.appliedVoices)) {
                    throw new Error("Invalid preset format");
                }

                // Give it a new ID to avoid collisions
                preset.id = Date.now().toString();

                storage.saveSessionPreset(preset);
                const updated = storage.getSessionPresets();
                setSessionPresets(updated);
                setActivePresetId(preset.id);

                // Clear the input
                e.target.value = '';
            } catch (err) {
                setError("Failed to import preset. Make sure it is a valid Shadowing preset JSON.");
            }
        };
        reader.readAsText(file);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target?.result as string;
            try {
                const parsed = parseShadowJSON(content);
                setSessionData(parsed);
                setActiveSessionPath(null);
            } catch (err) { setError("Invalid file structure. Make sure it is valid JSON."); }
        };
        reader.readAsText(file);
    };

    const handleStartSession = async (record: boolean = false, data?: ShadowData, existingSessionId?: number) => {
        const targetData = data || sessionData;
        if (!targetData) return;
        setError(null);

        try {
            // 1. Ensure a session exists
            let sessionId = existingSessionId || currentSessionId;

            // Only create new session if we don't have one AND we aren't forced to reuse one
            if (!sessionId || (data && !existingSessionId)) {
                sessionId = await storage.saveSession({
                    title: targetData.title,
                    description: targetData.description,
                    createdAt: targetData.createdAt,
                    rawData: JSON.stringify(targetData),
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

    const startDownload = async (customAppliedVoices?: AppliedVoice[]) => {
        if (!sessionData || !apiKey) return false;
        const voicesToUse = customAppliedVoices || appliedVoices;
        if (voicesToUse.length === 0) return false;

        setIsDownloading(true);
        setDownloadProgress(0);
        setError(null);
        setAudioError(null);
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

                for (const applied of voicesToUse) {
                    const preset = voicePresets.find(p => p.voiceId === applied.voiceId);
                    if (!preset) continue;

                    const voiceId = applied.voiceId;

                    const globalId = generateAudioId(
                        sentence.english,
                        voiceId,
                        applied.speed,
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
                                speed: applied.speed
                            }
                        });
                        audioBlob = audioRes.blob;
                        duration = audioRes.duration;

                        await storage.saveGlobalAudio({
                            id: globalId,
                            text: sentence.english,
                            voiceId: voiceId,
                            modelId: globalConfig.modelId,
                            speed: applied.speed,
                            stability: stability,
                            similarityBoost: preset.similarity_boost,
                            style: preset.style,
                            useSpeakerBoost: preset.use_speaker_boost,
                            audioBlob: audioBlob,
                            duration: duration
                        });
                    }

                    await storage.saveAudio({
                        sessionId: sessionId!,
                        sentenceIndex: sentence.index,
                        voiceId: voiceId,
                        modelId: globalConfig.modelId,
                        speed: applied.speed,
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
            setDownloadProgress(100);
            setIsDownloading(false);
            setAudioError(null);
            return sessionId; // Return the ID we actually used!
        } catch (err: any) {
            console.error("Download failed:", err);
            const isAuthError = err.message?.includes('401') || err.message?.includes('unauthorized') || err.message?.includes('permissions');
            const msg = isAuthError
                ? "API Key Auth Error (Check start-shadowing.bat)"
                : "Failed to prepare session audio.";

            setAudioError(msg);
            setError(msg);
            setIsDownloading(false);
            return false;
        }
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
            .map(([term, diff]: any) => ({ term, diff }))
            .sort((a: any, b: any) => b.diff - a.diff);
    };

    const handleSessionSelect = async (sessionPath: string) => {
        try {
            const response = await fetch(sessionPath);
            const content = await response.text();
            setSessionData(parseShadowJSON(content));
            setActiveSessionPath(sessionPath);
        } catch (err) {
            setError("Failed to load session data");
        }
    };

    return (
        <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-4">
            {/* Automation Diagnostic Overlay */}
            {window.location.search.includes('autoStart=true') && currentScreen === 'upload' && !isRecording && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                    <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl max-w-sm w-full text-center">
                        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-6"></div>
                        <h2 className="text-xl font-bold text-white mb-2">Automation Initializing</h2>
                        <p className="text-slate-400 text-sm mb-6">Preparing your session assets...</p>

                        <div className="space-y-3 text-left">
                            <div className="flex items-center gap-3 text-xs">
                                <div className={`w-2 h-2 rounded-full ${sessionData ? 'bg-emerald-500' : 'bg-slate-700 animate-pulse'}`}></div>
                                <span className={sessionData ? 'text-emerald-400' : 'text-slate-500'}>Session Data Loaded</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                                <div className={`w-2 h-2 rounded-full ${apiKey ? (audioError?.includes('API Key') || voiceError?.includes('401') ? 'bg-rose-500' : 'bg-emerald-500') : 'bg-rose-500'}`}></div>
                                <span className={apiKey ? (audioError?.includes('API Key') || voiceError?.includes('401') ? 'text-rose-400' : 'text-emerald-400') : 'text-rose-400'}>
                                    {apiKey ? (audioError?.includes('API Key') ? 'API Key Auth Error (Check .bat)' : 'API Key Found') : 'API Key Missing (Check .bat)'}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                                <div className={`w-2 h-2 rounded-full ${voices.length > 0 ? (voiceError?.includes('Using default') ? 'bg-amber-500' : 'bg-emerald-500') : (voiceError ? 'bg-rose-500' : 'bg-slate-700 animate-pulse')}`}></div>
                                <span className={voices.length > 0 ? (voiceError?.includes('Using default') ? 'text-amber-400' : 'text-emerald-400') : (voiceError ? 'text-rose-400' : 'text-slate-500')}>
                                    {voiceError ? `Voice Engine: ${voiceError}` : (voices.length > 0 ? 'Voice Engine Ready' : 'Voice Engine Loading...')}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                                <div className={`w-2 h-2 rounded-full ${isDownloading ? 'bg-blue-500 animate-pulse' : (downloadProgress === 100 ? 'bg-emerald-500' : (audioError ? 'bg-rose-500' : 'bg-slate-700'))}`}></div>
                                <span className={isDownloading ? 'text-blue-400' : (downloadProgress === 100 ? 'text-emerald-400' : (audioError ? 'text-rose-400' : 'text-slate-500'))}>
                                    {isDownloading ? `Preparing Audio: ${downloadProgress}%` : (downloadProgress === 100 ? 'Audio Ready' : (audioError ? audioError : 'Waiting for audio...'))}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <div className="absolute inset-0 z-0 bg-slate-950">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
            </div>

            <header className={`fixed top-0 left-0 right-0 p-6 flex justify-between items-center z-50 transition-all duration-700 ease-in-out ${isRecording ? 'opacity-0 -translate-y-8 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
                {/* Logo and Nav */}
                <div className="flex items-center gap-6">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        onClick={() => setCurrentScreen('lecture-index')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 border border-blue-500/20 rounded-2xl cursor-pointer group hover:bg-blue-600/20 transition-all shadow-lg shadow-blue-500/10"
                    >
                        <Compass className="w-6 h-6 text-blue-400 group-hover:rotate-12 transition-transform" />
                        <span className="text-xl font-black text-white tracking-tighter">ShadowQuest</span>
                    </motion.div>

                    {currentScreen !== 'lecture-index' && (
                        <nav className="hidden md:flex items-center gap-1 bg-slate-900/50 p-1 rounded-2xl border border-slate-800">
                            <button
                                onClick={() => setCurrentScreen('lecture-index')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${currentScreen === 'lecture-index' ? 'text-blue-400 bg-blue-400/10' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                            >
                                Lectures
                            </button>
                            <button
                                onClick={handleEnterLibrary}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${currentScreen !== 'lecture-index' ? 'text-blue-400 bg-blue-400/10' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                            >
                                Shadowing
                            </button>
                        </nav>
                    )}
                </div>
                {currentScreen === 'lecture-index' && !isRecording && (
                    <button
                        onClick={handleEnterLibrary}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 group"
                    >
                        <BookOpen className="w-4 h-4" />
                        <span className="text-xs font-bold">Library</span>
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                )}
                {!isRecording && currentScreen !== 'session' && currentScreen !== 'lecture-index' && (
                    <div className="flex items-center gap-3">
                        {/* API Key Input */}
                        <div className="flex items-center gap-2 bg-slate-800/30 px-3 py-1.5 rounded-xl border border-slate-700/50 focus-within:border-blue-500/50 transition-all">
                            <Key className="w-4 h-4 text-slate-500" />
                            <input
                                type={showApiKey ? "text" : "password"}
                                value={apiKey}
                                onChange={(e) => {
                                    setApiKey(e.target.value);
                                    storage.setApiKey(e.target.value);
                                }}
                                className="bg-transparent text-xs text-slate-300 focus:outline-none w-24 md:w-32 font-mono"
                                placeholder="API Key"
                            />
                            <button
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                        </div>

                        {/* Font Selector */}
                        <div className="flex items-center gap-2 bg-slate-800/30 px-3 py-1.5 rounded-xl border border-slate-700/50">
                            <Type className="w-4 h-4 text-slate-500" />
                            <select
                                value={fontFamily}
                                onChange={(e) => setFontFamily(e.target.value)}
                                className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer font-medium hover:text-white transition-colors"
                            >
                                <option value="Inter" className="bg-slate-900">Inter</option>
                                <option value="Outfit" className="bg-slate-900">Outfit</option>
                                <option value="Rubik" className="bg-slate-900">Rubik</option>
                                <option value="Roboto" className="bg-slate-900">Roboto</option>
                            </select>
                        </div>
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="p-3 bg-slate-800/50 hover:bg-slate-700 rounded-xl border border-slate-700 transition-all group"
                        >
                            <Settings className="w-5 h-5 text-slate-400 group-hover:text-blue-400 group-hover:rotate-90 transition-all duration-500" />
                        </button>
                    </div>
                )}
            </header>

            <main className={`w-full z-10 pt-24 pb-12 transition-all duration-500 ${(currentScreen === 'session' || currentScreen === 'upload') ? 'max-w-[98%]' : 'max-w-4xl'}`}>
                <AnimatePresence mode="wait">
                    {currentScreen === 'lecture-index' && (
                        <motion.div key="lecture-index" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <LectureIndex onStartLearning={handleEnterLibrary} />
                        </motion.div>
                    )}

                    {currentScreen === 'upload' && (
                        <div key="upload-screen-root">
                            <div className="flex flex-col gap-6 w-full px-4 text-center items-center">
                                {/* Presets Section on Home Screen */}
                                <motion.div
                                    initial={{ opacity: 0, y: -20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="glass-card p-6 text-white w-full"
                                >
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <Save className="w-4 h-4" />
                                            Saved Presets (Load configurations)
                                        </h3>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => document.getElementById('import-preset-input')?.click()}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold transition-all border border-slate-700"
                                            >
                                                <Upload className="w-3 h-3" /> Import Preset
                                            </button>
                                            <input
                                                id="import-preset-input"
                                                type="file"
                                                accept=".json"
                                                onChange={handleImportPreset}
                                                className="hidden"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {sessionPresets.length === 0 ? (
                                            <p className="text-xs text-slate-600 italic py-4 col-span-full text-center bg-slate-800/20 rounded-xl border border-dashed border-slate-800">No presets saved yet. Configure in settings and save to see them here.</p>
                                        ) : (
                                            sessionPresets.map(p => (
                                                <div
                                                    key={p.id}
                                                    onClick={() => setActivePresetId(p.id)}
                                                    className={`group relative p-4 rounded-xl border transition-all cursor-pointer ${activePresetId === p.id ? 'bg-blue-600/10 border-blue-500' : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50'}`}
                                                >
                                                    <div className="flex flex-col gap-1 pr-8 text-left">
                                                        <span className={`font-bold text-sm ${activePresetId === p.id ? 'text-blue-400' : 'text-white'}`}>{p.name}</span>
                                                        <span className="text-[10px] text-slate-500">{p.appliedVoices.length} voices</span>
                                                    </div>
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1 items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={(e) => handleExportPreset(p, e)}
                                                            className="p-2 rounded-lg bg-slate-900/80 text-blue-400 hover:bg-blue-600 hover:text-white transition-all shadow-lg"
                                                            title="Download Preset"
                                                        >
                                                            <Download className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleDeletePreset(p.id, e)}
                                                            className="p-2 rounded-lg bg-slate-900/80 text-slate-400 hover:bg-rose-500 hover:text-white transition-all shadow-lg"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </motion.div>

                                {/* Session Library Section */}
                                <motion.div
                                    initial={{ opacity: 0, y: -20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="glass-card p-6 text-white w-full"
                                >
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                                        <h3 className="text-xl font-bold flex items-center gap-2">
                                            <Layout className="w-5 h-5 text-blue-400" />
                                            Session Library
                                        </h3>

                                        {/* Filter Chips */}
                                        <div className="flex flex-wrap gap-2">
                                            {['All', ...Array.from(new Set(sessionList.map(s => s.displayPath || 'General')))].map(filter => (
                                                <button
                                                    key={filter}
                                                    onClick={() => setSelectedFilter(filter)}
                                                    className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all border ${selectedFilter === filter
                                                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                                                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-300 hover:bg-slate-700'
                                                        }`}
                                                >
                                                    {filter}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                                        {sessionList
                                            .filter(s => selectedFilter === 'All' || (s.displayPath || 'General') === selectedFilter)
                                            .map((session) => (
                                                <button
                                                    key={session.id}
                                                    onClick={() => handleSessionSelect(session.path)}
                                                    className={`px-4 py-4 rounded-xl border border-slate-700/50 text-left hover:bg-blue-500/10 hover:border-blue-500/30 transition-all group ${activeSessionPath === session.path ? 'bg-blue-500/10 border-blue-500' : 'bg-slate-800/30'}`}
                                                >
                                                    <div className="flex flex-col gap-1">
                                                        <span className="font-bold text-sm group-hover:text-blue-400 transition-colors line-clamp-1">{session.name}</span>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] text-slate-500 italic uppercase tracking-wider">{session.displayPath || 'General'}</span>
                                                            <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                    </div>
                                </motion.div>

                                {/* Upload Section */}
                                <motion.div
                                    key="upload-card"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 1.05 }}
                                    className="glass-card p-6 text-white w-full"
                                >
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                                        <div className="flex items-center gap-4 text-left">
                                            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                                                <Upload className="text-blue-400 w-6 h-6" />
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-bold">Use Custom JSON</h2>
                                                <p className="text-sm text-slate-400">Upload your own learning data.</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-center sm:items-end gap-2 shrink-0">
                                            <label className="btn-primary bg-slate-800 border border-slate-700 hover:bg-slate-700 px-6 py-2 cursor-pointer transition-all">
                                                <input type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
                                                Browse File (JSON)
                                            </label>
                                            {sessionData && (
                                                <span className="text-xs text-blue-400 font-mono animate-in fade-in slide-in-from-top-1 text-right">
                                                    Selected: {sessionData.title}
                                                </span>
                                            )}
                                        </div>
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

                            {/* Next Button on Home Screen */}
                            {sessionData && (
                                <div className="fixed bottom-10 right-10 flex flex-col items-end gap-4 z-[60]">
                                    <button
                                        onClick={() => setCurrentScreen('setup-summary')}
                                        className="flex items-center gap-3 p-4 pr-10 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl shadow-2xl shadow-blue-500/30 border border-blue-400/30 transition-all hover:scale-110 active:scale-95 group"
                                    >
                                        <div className="w-12 h-12 bg-blue-700 rounded-xl flex items-center justify-center">
                                            <ArrowRight className="w-8 h-8" />
                                        </div>
                                        <div className="text-left">
                                            <span className="text-xs text-blue-200 block -mb-1">Ready to go?</span>
                                            <span className="text-2xl font-black tracking-tight uppercase">Next</span>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {currentScreen === 'setup-summary' && sessionData && (
                        <div key="setup-summary-root" className="relative w-full">
                            <motion.div
                                key="summary"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass-card p-8 text-white max-w-2xl mx-auto space-y-8"
                            >
                                <div className="flex items-center gap-4 border-b border-slate-700 pb-6">
                                    <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400">
                                        <Layout className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold">{sessionData.title}</h2>
                                        <p className="text-slate-400">{sessionData.sentences.length} Sentences ready</p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <label className="text-sm font-medium text-slate-400 block">Session Notes (Optional)</label>
                                    <textarea
                                        value={userNote}
                                        onChange={(e) => setUserNote(e.target.value)}
                                        placeholder="Write something before starting..."
                                        className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                                    <div>
                                        <p className="text-slate-500">Actors</p>
                                        <p className="font-bold">{appliedVoices.length} Applied</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">Delay Ratio</p>
                                        <p className="font-bold">{globalConfig.followDelayRatio}x</p>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Back Button */}
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
                                    <span className="text-sm font-bold tracking-tight">Back to Home</span>
                                </button>
                            </motion.div>

                            {/* Start Buttons or Progress */}
                            <div className="fixed bottom-10 right-10 flex flex-col items-end gap-4 z-[70]">
                                {isDownloading ? (
                                    <div className="flex flex-col items-end gap-2 bg-slate-900/80 p-6 rounded-3xl border border-blue-500/30 backdrop-blur-md shadow-2xl">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                                            <span className="text-lg font-bold text-blue-400">Downloading Voice Assets...</span>
                                        </div>
                                        <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <motion.div
                                                className="bg-blue-500 h-full"
                                                initial={{ width: 0 }}
                                                animate={{ width: `${downloadProgress}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-mono text-slate-500">{downloadProgress}% complete</span>
                                    </div>
                                ) : downloadProgress === 100 ? (
                                    <>
                                        <motion.button
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            onClick={() => handleStartSession(true)}
                                            className="flex items-center gap-3 p-4 pr-10 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl shadow-2xl shadow-rose-500/30 border border-rose-400/30 transition-all hover:scale-110 active:scale-95 group"
                                        >
                                            <div className="w-12 h-12 bg-rose-700 rounded-xl flex items-center justify-center">
                                                <Radio className="w-8 h-8 animate-pulse" />
                                            </div>
                                            <div className="text-left">
                                                <span className="text-xs text-rose-200 block -mb-1">All ready!</span>
                                                <span className="text-2xl font-black tracking-tight uppercase">Start & Record</span>
                                            </div>
                                        </motion.button>
                                        <motion.button
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ delay: 0.1 }}
                                            onClick={() => handleStartSession(false)}
                                            className="flex items-center gap-3 p-4 pr-10 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl shadow-2xl shadow-blue-500/30 border border-blue-400/30 transition-all hover:scale-110 active:scale-95 group"
                                        >
                                            <div className="w-12 h-12 bg-blue-700 rounded-xl flex items-center justify-center">
                                                <ArrowRight className="w-8 h-8" />
                                            </div>
                                            <div className="text-left">
                                                <span className="text-xs text-blue-200 block -mb-1">Begin practice</span>
                                                <span className="text-2xl font-black tracking-tight uppercase">Start Session</span>
                                            </div>
                                        </motion.button>
                                    </>
                                ) : (
                                    <div className="text-slate-500 text-sm italic bg-slate-900/50 p-4 rounded-xl backdrop-blur-sm">Waiting for download to initialize...</div>
                                )}
                            </div>
                        </div>
                    )}

                    {currentScreen === 'session' && sessionData && currentSessionId && (
                        <motion.div key="session" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
                            <ShadowingSession
                                sessionData={sessionData}
                                appliedVoices={appliedVoices}
                                globalConfig={globalConfig}
                                sessionId={currentSessionId}
                                onFinish={handleSessionFinish}
                                isRecording={isRecording}
                                onReadyToRecord={isRecording ? () => screenRecorder.start(isAutomatedSession) : undefined}
                            />
                        </motion.div>
                    )}

                    {currentScreen === 'final-summary' && sessionData && (
                        <motion.div key="final" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-12 text-center text-white max-w-3xl mx-auto space-y-12">
                            <div className="space-y-2">
                                <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                                </div>
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
                    )}

                    {currentScreen === 'storage-manager' && (
                        <motion.div
                            key="storage-manager"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                        >
                            <StorageManager onBack={() => setCurrentScreen('upload')} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Settings Overlay */}
            <AnimatePresence>
                {isSettingsOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsSettingsOpen(false)}
                            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="p-5 pb-3 flex justify-between items-center border-b border-slate-800">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Settings className="w-5 h-5 text-blue-400" />
                                    Session Settings
                                </h2>
                            </div>

                            <div className="flex-1 flex overflow-hidden">
                                {/* Left Pane: Available Voices */}
                                <div className="w-1/2 border-r border-slate-800 flex flex-col">
                                    <div className="p-4 bg-slate-800/20 border-b border-slate-800">
                                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                            <Volume2 className="w-4 h-4" /> Available Voices
                                        </h3>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
                                        {voicePresets.map((p) => (
                                            <button
                                                key={p.id}
                                                onClick={() => addAppliedVoice(p)}
                                                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-800/30 border border-slate-700/50 hover:bg-blue-600/10 hover:border-blue-500/50 transition-all text-left group"
                                            >
                                                <div>
                                                    <p className="font-bold text-[13px] text-white group-hover:text-blue-400 transition-colors">{p.name.split(' — ')[0].split(' - ')[0]}</p>
                                                    <p className="text-[10px] text-slate-500 line-clamp-1">{p.description}</p>
                                                </div>
                                                <Plus className="w-3.5 h-3.5 text-slate-600 group-hover:text-blue-400" />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Right Pane: Applied Voices */}
                                <div className="w-1/2 flex flex-col bg-slate-900/50">
                                    <div className="p-4 bg-slate-800/20 border-b border-slate-800 flex justify-between items-center">
                                        <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4" /> Applied Session Voices
                                        </h3>
                                        <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">{appliedVoices.length}</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                                        {appliedVoices.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                                                <div className="w-16 h-16 bg-slate-800/50 rounded-2xl flex items-center justify-center text-slate-700">
                                                    <Plus className="w-8 h-8" />
                                                </div>
                                                <p className="text-xs text-slate-600 italic">Select voices from the left to add them to your session.</p>
                                            </div>
                                        ) : (
                                            appliedVoices.map((v, idx) => (
                                                <div key={v.id} className="px-2.5 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50 space-y-1.5 relative group">
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex items-center gap-0.5">
                                                                <button onClick={() => moveVoice(idx, 'up')} disabled={idx === 0} className="p-0.5 text-slate-600 hover:text-blue-400 disabled:opacity-0 transition-all"><ChevronUp className="w-3 h-3" /></button>
                                                                <button onClick={() => moveVoice(idx, 'down')} disabled={idx === appliedVoices.length - 1} className="p-0.5 text-slate-600 hover:text-blue-400 disabled:opacity-0 transition-all"><ChevronDown className="w-3 h-3" /></button>
                                                            </div>
                                                            <span className="font-bold text-[12px] text-white truncate max-w-[100px]">{v.name.split(' - ')[0].split(' — ')[0]}</span>
                                                        </div>
                                                        <button onClick={() => removeAppliedVoice(v.id)} className="p-1 rounded-lg bg-slate-900 text-slate-500 hover:bg-rose-500/20 hover:text-rose-400 transition-all">
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>

                                                    <div className="flex items-center gap-2 mb-2">
                                                        <button
                                                            onClick={() => updateAppliedVoice(v.id, { showTranslation: !v.showTranslation })}
                                                            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-bold transition-all border ${v.showTranslation !== false ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                                                            title="Toggle Translation"
                                                        >
                                                            <Globe className="w-2.5 h-2.5" /> Trans
                                                        </button>
                                                        <button
                                                            onClick={() => updateAppliedVoice(v.id, { showWords: !v.showWords })}
                                                            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-bold transition-all border ${v.showWords !== false ? 'bg-purple-600/20 border-purple-500/50 text-purple-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                                                            title="Toggle Word Meaning"
                                                        >
                                                            <MessageSquare className="w-2.5 h-2.5" /> Mean
                                                        </button>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                                        <div className="flex flex-col">
                                                            <div className="flex justify-between items-center text-[9px] font-bold mb-0.5">
                                                                <span className="text-slate-500 uppercase tracking-tighter">Sped</span>
                                                                <span className="text-blue-400">{v.speed.toFixed(1)}x</span>
                                                            </div>
                                                            <input
                                                                type="range" min="0.7" max="1.2" step="0.1"
                                                                value={v.speed}
                                                                onChange={(e) => updateAppliedVoice(v.id, { speed: parseFloat(e.target.value) })}
                                                                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                            />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <div className="flex justify-between items-center text-[9px] font-bold mb-0.5">
                                                                <span className="text-slate-500 uppercase tracking-tighter">Rept</span>
                                                                <span className="text-blue-400">{v.repeat}x</span>
                                                            </div>
                                                            <input
                                                                type="range" min="1" max="10" step="1"
                                                                value={v.repeat}
                                                                onChange={(e) => updateAppliedVoice(v.id, { repeat: parseInt(e.target.value) })}
                                                                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Settings Footer */}
                            <div className="p-4 bg-slate-950/50 border-t border-slate-800 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Model</label>
                                        <select
                                            value={globalConfig.modelId}
                                            onChange={(e) => setGlobalConfig({ ...globalConfig, modelId: e.target.value })}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                        >
                                            <option value="eleven_multilingual_v2">Multilingual v2 (Best)</option>
                                            <option value="eleven_turbo_v2_5">Turbo v2.5 (Fast)</option>
                                            <option value="eleven_flash_v2_5">Flash v2.5 (Fastest)</option>
                                        </select>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Follow Delay</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="range" min="0.5" max="2.5" step="0.1"
                                                value={globalConfig.followDelayRatio}
                                                onChange={(e) => setGlobalConfig({ ...globalConfig, followDelayRatio: parseFloat(e.target.value) })}
                                                className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                            />
                                            <span className="text-[10px] font-mono text-blue-400 min-w-[3ch]">{globalConfig.followDelayRatio.toFixed(1)}x</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={handleSavePreset}
                                        className="flex-1 flex items-center justify-center gap-2 p-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg transition-all active:scale-95 font-bold text-xs"
                                    >
                                        <Save className="w-3.5 h-3.5" /> Save as Preset
                                    </button>
                                    <button
                                        onClick={() => setIsSettingsOpen(false)}
                                        className="px-6 p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all active:scale-95 font-bold text-xs"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Authentication Modal */}
            <AnimatePresence>
                {isAuthModalOpen && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsAuthModalOpen(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-8 space-y-6"
                        >
                            <div className="text-center space-y-2">
                                <div className="w-16 h-16 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <Key className="w-8 h-8 text-blue-400" />
                                </div>
                                <h2 className="text-2xl font-bold text-white">Access Locked</h2>
                                <p className="text-slate-400 text-sm">쉐도잉 학습 라이브러리에 접근하려면 <br />액세스 코드를 입력해 주세요.</p>
                            </div>

                            <div className="space-y-4">
                                <div className="relative">
                                    <input
                                        type="password"
                                        placeholder="Enter Access Code"
                                        value={authCode}
                                        onChange={(e) => setAuthCode(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleCheckAuth()}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-center text-xl tracking-widest"
                                        autoFocus
                                    />
                                    {authError && (
                                        <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-rose-500 text-xs font-bold mt-2 text-center">
                                            {authError}
                                        </motion.p>
                                    )}
                                </div>
                                <button
                                    onClick={handleCheckAuth}
                                    disabled={isCheckingAuth}
                                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-2"
                                >
                                    {isCheckingAuth ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>Unlock Library <ArrowRight className="w-4 h-4" /></>
                                    )}
                                </button>
                                <button
                                    onClick={() => setIsAuthModalOpen(false)}
                                    className="w-full py-2 text-slate-500 hover:text-slate-400 text-sm font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <footer className="fixed bottom-0 left-0 right-0 p-6 text-center text-sm text-slate-600 pointer-events-none">
                <p>Powered by ElevenLabs AI Audio Technology</p>
            </footer>
        </div>
    );
}

export default App;
