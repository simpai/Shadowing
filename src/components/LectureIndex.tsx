import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Youtube, Twitter, Filter, Layout } from 'lucide-react';

interface Lecture {
    id: string;
    title: string;
    topic: string;
    difficulty: string;
    platform: 'YouTube' | 'Twitter';
    url: string;
    thumbnail?: string;
    date: string;
}

interface LectureIndexProps {
    onStartLearning: () => void;
}

export const LectureIndex: React.FC<LectureIndexProps> = ({ onStartLearning }) => {
    const [lectures, setLectures] = useState<Lecture[]>([]);
    const [filter, setFilter] = useState({ topic: 'All', difficulty: 'All' });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetch('/lectures.json')
            .then(res => res.json())
            .then(data => {
                setLectures(data);
                setIsLoading(false);
            })
            .catch(err => {
                console.error("Failed to load lectures", err);
                setIsLoading(false);
            });
    }, []);

    const topics = ['All', ...Array.from(new Set(lectures.map(l => l.topic)))];
    const difficulties = ['All', 'Easy', 'Medium', 'Hard', 'Fun'];

    const filteredLectures = lectures.filter(l =>
        (filter.topic === 'All' || l.topic === filter.topic) &&
        (filter.difficulty === 'All' || l.difficulty === filter.difficulty)
    );

    return (
        <div className="max-w-7xl mx-auto px-6 py-12 space-y-12">
            <header className="text-center space-y-4">
                <motion.h1
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-5xl md:text-7xl font-black text-white tracking-tighter"
                >
                    ShadowQuest <span className="text-blue-500">Lectures</span>
                </motion.h1>
                <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                    게임과 다양한 테마를 통해 영어를 배우는 특별한 강의 리스트입니다. <br />
                    영상을 보고 난 후, 서비스를 잠금 해제하여 직접 쉐도잉 연습을 해보세요!
                </p>
            </header>


            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredLectures.map((lecture, idx) => (
                    <motion.a
                        key={lecture.id}
                        href={lecture.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="group relative glass-card overflow-hidden hover:border-blue-500/50 transition-all"
                    >
                        <div className="aspect-video bg-slate-800 relative overflow-hidden">
                            {lecture.thumbnail ? (
                                <img src={lecture.thumbnail} alt={lecture.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-700">
                                    <Youtube className="w-16 h-16" />
                                </div>
                            )}
                            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-2xl">
                                    <Play className="w-8 h-8 text-blue-600 fill-current ml-1" />
                                </div>
                            </div>
                            <div className="absolute top-4 left-4 flex gap-2">
                                <span className="px-3 py-1 bg-blue-600 text-[10px] font-black uppercase tracking-widest rounded-full text-white">
                                    {lecture.topic}
                                </span>
                                <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full text-white ${lecture.difficulty === 'Easy' ? 'bg-emerald-500' :
                                    lecture.difficulty === 'Medium' ? 'bg-amber-500' : 'bg-rose-500'
                                    }`}>
                                    {lecture.difficulty}
                                </span>
                            </div>
                        </div>
                        <div className="p-6 space-y-3">
                            <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-2 leading-tight">
                                {lecture.title}
                            </h3>
                            <div className="flex justify-between items-center text-slate-500 text-xs font-medium">
                                <div className="flex items-center gap-1.5">
                                    {lecture.platform === 'YouTube' ? <Youtube className="w-4 h-4 text-red-500" /> : <Twitter className="w-4 h-4 text-sky-400" />}
                                    <span>{lecture.platform}</span>
                                </div>
                                <span className="font-mono">{lecture.date}</span>
                            </div>
                        </div>
                    </motion.a>
                ))}
            </div>

            {filteredLectures.length === 0 && !isLoading && (
                <div className="text-center py-24 glass-card">
                    <Layout className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium">선택한 필터에 해당하는 강의가 없습니다.</p>
                </div>
            )}
        </div>
    );
};
