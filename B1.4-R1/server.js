const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;
const BASE_DIR = path.join(__dirname, 'files');
const SHAREX_DIR = path.join(BASE_DIR, 'sharex');
let totalBytesSent = 0;
let activeDownloads = 0;

// Ensure the sharex directory exists
if (!fs.existsSync(SHAREX_DIR)) {
    fs.mkdirSync(SHAREX_DIR, { recursive: true });
}

// Configure multer for file uploads
const upload = multer({ dest: SHAREX_DIR });

// Middleware to track bandwidth
app.use((req, res, next) => {
    const originalSend = res.send.bind(res);
    res.send = (body) => {
        totalBytesSent += Buffer.byteLength(body);
        originalSend(body);
    };
    next();
});

app.use(express.static('public'));
app.use(bodyParser.json());

app.get('/files', (req, res) => {
    const requestedPath = req.query.path ? path.join(BASE_DIR, req.query.path) : BASE_DIR;

    // Prevent directory traversal attacks
    if (!requestedPath.startsWith(BASE_DIR)) {
        return res.status(400).json({ error: 'Invalid path' });
    }

    fs.readdir(requestedPath, { withFileTypes: true }, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to scan directory' });
        }

        const fileInfos = files.map(file => {
            return {
                name: file.name,
                isDirectory: file.isDirectory(),
                path: path.relative(BASE_DIR, path.join(requestedPath, file.name))
            };
        });

        res.json(fileInfos);
    });
});

app.get('/preview', (req, res) => {
    const filePath = path.join(BASE_DIR, req.query.path);

    // Prevent directory traversal attacks
    if (!filePath.startsWith(BASE_DIR)) {
        return res.status(400).send('Invalid path');
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            return res.status(500).send('Unable to read file');
        }
        totalBytesSent += data.length;
        res.sendFile(filePath);
    });
});

app.get('/download', (req, res) => {
    const filePath = path.join(BASE_DIR, req.query.path);

    // Prevent directory traversal attacks
    if (!filePath.startsWith(BASE_DIR)) {
        return res.status(400).send('Invalid path');
    }

    activeDownloads++;
    const decrementDownloads = () => {
        if (activeDownloads > 0) {
            activeDownloads--;
        }
    };

    res.on('finish', decrementDownloads);
    res.on('close', decrementDownloads);
    res.on('error', decrementDownloads);

    fs.stat(filePath, (err, stats) => {
        if (err) {
            decrementDownloads();
            return res.status(500).send('Unable to read file');
        }
        totalBytesSent += stats.size;
        res.download(filePath);
    });
});

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }

    const uploadedFilePath = path.join(SHAREX_DIR, req.file.filename);
    const targetFilePath = path.join(SHAREX_DIR, req.file.originalname);

    // Rename the file to its original name
    fs.rename(uploadedFilePath, targetFilePath, (err) => {
        if (err) {
            return res.status(500).send('Failed to save file');
        }

        res.json({ success: true, message: 'File uploaded successfully', path: path.relative(BASE_DIR, targetFilePath) });
    });
});

app.get('/stats', (req, res) => {
    const cpus = os.cpus();
    const cpuUsage = cpus.map(cpu => {
        const total = Object.values(cpu.times).reduce((acc, time) => acc + time, 0);
        const usage = ((total - cpu.times.idle) / total) * 100;
        return {
            model: cpu.model,
            speed: cpu.speed,
            usage: usage.toFixed(2)
        };
    });

    const totalMB = (totalBytesSent / (1024 * 1024)).toFixed(2);
    const totalGB = (totalBytesSent / (1024 * 1024 * 1024)).toFixed(2);

    res.json({ totalBytesSent, totalMB, totalGB, activeDownloads, cpuUsage });
});

app.listen(PORT, () => {
    console.log(`File browser server is running at http://localhost:${PORT}`);
});
