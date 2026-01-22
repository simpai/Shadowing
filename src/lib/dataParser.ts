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

export const parseShadowXML = (xmlString: string): ShadowData => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    const sessionInfo = xmlDoc.querySelector('SessionInfo') || xmlDoc.querySelector('Meta');
    const root = xmlDoc.querySelector('ShadowingSession') || xmlDoc.querySelector('shadowing');

    const title = (sessionInfo?.querySelector('Title') || sessionInfo?.querySelector('title') || root?.querySelector('title'))?.textContent || 'Untitled Session';
    const description = (sessionInfo?.querySelector('Description') || sessionInfo?.querySelector('description') || root?.querySelector('description'))?.textContent || '';
    const createdAt = (sessionInfo?.querySelector('CreatedAt') || sessionInfo?.querySelector('createdAt') || root?.querySelector('createdAt'))?.textContent || new Date().toISOString().split('T')[0];

    const sentenceNodes = xmlDoc.querySelectorAll('Sentence') || xmlDoc.querySelectorAll('sentence');
    const sentences: Sentence[] = Array.from(sentenceNodes).map((node) => {
        const wordsNodes = node.querySelectorAll('Words Word') || node.querySelectorAll('words word');
        const words: Word[] = Array.from(wordsNodes).map((w) => {
            const diffText = w.querySelector('Difficulty')?.textContent || w.getAttribute('difficulty') || '1';
            let difficulty = 1;
            if (diffText.toLowerCase() === 'easy') difficulty = 1;
            else if (diffText.toLowerCase() === 'medium') difficulty = 2;
            else if (diffText.toLowerCase() === 'hard') difficulty = 3;
            else difficulty = parseInt(diffText, 10) || 1;

            return {
                term: w.querySelector('Term')?.textContent || w.getAttribute('term') || '',
                meaning: w.querySelector('Meaning')?.textContent || w.getAttribute('meaning') || '',
                difficulty,
            };
        });

        return {
            index: parseInt(node.querySelector('Index')?.textContent || node.querySelector('index')?.textContent || node.getAttribute('index') || '0', 10),
            english: (node.querySelector('English') || node.querySelector('english'))?.textContent?.trim() || '',
            korean: (node.querySelector('Korean') || node.querySelector('korean'))?.textContent?.trim() || '',
            words,
            stability: parseFloat(node.querySelector('Stability')?.textContent || node.getAttribute('stability') || '') || undefined,
        };
    });

    return {
        title,
        description,
        createdAt,
        sentences,
    };
};
