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
}

export interface ShadowData {
    title: string;
    description: string;
    createdAt: string;
    sentences: Sentence[];
}

export const parseShadowXML = (xmlString: string): ShadowData => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    // Handle both new <SessionInfo> and old <Meta> or root <shadowing> child elements
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
        };
    });

    return {
        title,
        description,
        createdAt,
        sentences,
    };
};
