import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLES_DIR = path.join(__dirname, '../public/samples');
const OUTPUT_FILE = path.join(SAMPLES_DIR, 'index.json');

function getTitle(filePath, content) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json') {
        try {
            const data = JSON.parse(content);
            return data.title || path.basename(filePath, ext);
        } catch (e) {
            return path.basename(filePath, ext);
        }
    } else if (ext === '.xml') {
        const match = content.match(/<title>(.*?)<\/title>/);
        return match ? match[1] : path.basename(filePath, ext);
    }
    return path.basename(filePath, ext);
}

function generateIndex() {
    console.log('Scanning samples directory...');
    const files = fs.readdirSync(SAMPLES_DIR);

    const index = files
        .filter(file => (file.endsWith('.json') || file.endsWith('.xml')) && file !== 'index.json')
        .map(file => {
            const filePath = path.join(SAMPLES_DIR, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const title = getTitle(filePath, content);

            return {
                id: path.basename(file, path.extname(file)),
                name: title,
                path: `/samples/${file}`
            };
        });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 4));
    console.log(`Successfully generated index with ${index.length} samples.`);
}

generateIndex();
