import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { storage, GlobalAudio } from '../lib/storage';

interface StorageManagerProps {
    onBack: () => void;
}

export const StorageManager: React.FC<StorageManagerProps> = ({ onBack }) => {
    const [audios, setAudios] = useState<GlobalAudio[]>([]);
    const [loading, setLoading] = useState(true);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        loadAudios();
    }, []);

    const loadAudios = async () => {
        setLoading(true);
        const data = await storage.getGlobalAudios();
        setAudios(data.sort((a, b) => a.text.localeCompare(b.text)));
        setLoading(false);
    };

    const handleDelete = async (id: string) => {
        await storage.deleteGlobalAudio(id);
        setAudios(prev => prev.filter(a => a.id !== id));
    };

    const handleClearAll = async () => {
        if (confirm('모든 캐시된 오디오를 삭제하시겠습니까?')) {
            await storage.clearAllAudio();
            setAudios([]);
        }
    };

    const togglePlay = (audio: GlobalAudio) => {
        if (playingId === audio.id) {
            audioRef.current?.pause();
            setPlayingId(null);
        } else {
            if (audioRef.current) {
                const url = URL.createObjectURL(audio.audioBlob);
                audioRef.current.src = url;
                audioRef.current.play();
                setPlayingId(audio.id);
                audioRef.current.onended = () => setPlayingId(null);
            }
        }
    };

    const formatSize = (blob: Blob) => {
        const kb = blob.size / 1024;
        return `${kb.toFixed(1)} KB`;
    };

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <audio ref={audioRef} className="hidden" />

            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Storage Manager</h1>
                    <p className="text-slate-400">캐시된 오디오 파일을 관리하고 들어볼 수 있습니다.</p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={handleClearAll}
                        className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 border border-rose-500/30 rounded-xl transition-all text-sm font-medium"
                    >
                        전체 삭제
                    </button>
                    <button
                        onClick={onBack}
                        className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700 text-white border border-slate-700 rounded-xl transition-all text-sm font-medium"
                    >
                        뒤로가기
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 p-6 rounded-3xl">
                    <p className="text-slate-400 text-sm mb-1">총 오디오 수</p>
                    <p className="text-3xl font-black text-white">{audios.length}개</p>
                </div>
                <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 p-6 rounded-3xl">
                    <p className="text-slate-400 text-sm mb-1">총 예상 용량</p>
                    <p className="text-3xl font-black text-white">
                        {(audios.reduce((acc, curr) => acc + curr.audioBlob.size, 0) / (1024 * 1024)).toFixed(2)} MB
                    </p>
                </div>
            </div>

            <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                    {audios.map(audio => (
                        <motion.div
                            key={audio.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-slate-800/30 backdrop-blur-md border border-slate-700/30 p-4 rounded-2xl flex items-center gap-4 group hover:bg-slate-800/50 transition-all"
                        >
                            <button
                                onClick={() => togglePlay(audio)}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${playingId === audio.id ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/40' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                            >
                                {playingId === audio.id ? (
                                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5"><path d="M8 5v14l11-7z" /></svg>
                                )}
                            </button>

                            <div className="flex-grow min-w-0">
                                <p className="text-white font-medium truncate">{audio.text}</p>
                                <div className="flex gap-3 mt-1">
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{audio.voiceId.substring(0, 8)}...</span>
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{audio.speed}x</span>
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-blue-400/70">{formatSize(audio.audioBlob)}</span>
                                </div>
                            </div>

                            <button
                                onClick={() => handleDelete(audio.id)}
                                className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-rose-400 transition-all"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {!loading && audios.length === 0 && (
                    <div className="py-20 text-center">
                        <p className="text-slate-500 italic">저장된 오디오가 없습니다.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
