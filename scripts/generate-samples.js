import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSIONS_DIR = path.join(__dirname, '../public/sessions');
const OUTPUT_FILE = path.join(__dirname, '../public/index.json');

function getTitle(filePath, content) {
    try {
        const data = JSON.parse(content);
        return data.title || path.basename(filePath, '.json');
    } catch (e) {
        return path.basename(filePath, '.json');
    }
}

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            if (file.endsWith('.json') && file !== 'index.json') {
                arrayOfFiles.push(fullPath);
            }
        }
    });

    return arrayOfFiles;
}

function generateIndex() {
    console.log('Scanning sessions directory recursively...');

    if (!fs.existsSync(SESSIONS_DIR)) {
        console.error(`Error: Directory not found: ${SESSIONS_DIR}`);
        return;
    }

    const files = getAllFiles(SESSIONS_DIR);

    const index = files.map(filePath => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const title = getTitle(filePath, content);

        // Create relative path for the web app (starting with /sessions/)
        const relativePath = '/sessions' + filePath.replace(SESSIONS_DIR, '').replace(/\\/g, '/');

        // Create a human-readable display path (relative to sessions folder)
        let displayPath = filePath.replace(SESSIONS_DIR, '').replace(/\\/g, '/');
        if (displayPath.startsWith('/')) displayPath = displayPath.substring(1);
        displayPath = path.dirname(displayPath);
        if (displayPath === '.') displayPath = '';

        return {
            id: path.basename(filePath, '.json').toLowerCase().replace(/\s+/g, '-'),
            name: title,
            path: relativePath,
            displayPath: displayPath
        };
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2));
    console.log(`Successfully generated index with ${index.length} sessions.`);
}

generateIndex();
