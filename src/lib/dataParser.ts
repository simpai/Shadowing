export interface Word {
    term: string;
    meaning: string;
    difficulty: number;
}

export interface Sentence {
    index: number;
    english: string;
    korean: string;
    words: Word[];
    stability?: number;
}

export interface ShadowData {
    title: string;
    description: string;
    createdAt: string;
    sentences: Sentence[];
}

export const parseShadowJSON = (jsonString: string): ShadowData => {
    try {
        const data = JSON.parse(jsonString);

        // Basic validation and mapping
        return {
            title: data.title || data.SessionInfo?.Title || 'Untitled Session',
            description: data.description || data.SessionInfo?.Description || '',
            createdAt: data.createdAt || data.SessionInfo?.CreatedAt || new Date().toISOString().split('T')[0],
            sentences: (data.sentences || []).map((s: any, idx: number) => ({
                index: s.index || idx + 1,
                english: s.english || '',
                korean: s.korean || '',
                stability: s.stability,
                words: (s.words || []).map((w: any) => {
                    let difficulty = 1;
                    if (typeof w.difficulty === 'string') {
                        const d = w.difficulty.toLowerCase();
                        if (d === 'easy') difficulty = 1;
                        else if (d === 'medium') difficulty = 2;
                        else if (d === 'hard') difficulty = 3;
                        else difficulty = parseInt(d, 10) || 1;
                    } else {
                        difficulty = w.difficulty || 1;
                    }
                    return {
                        term: w.term || '',
                        meaning: w.meaning || '',
                        difficulty
                    };
                })
            }))
        };
    } catch (e) {
        console.error('Failed to parse Shadowing JSON:', e);
        throw new Error('Invalid JSON format');
    }
};
