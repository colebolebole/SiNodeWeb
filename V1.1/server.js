const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3000;
const BASE_DIR = path.join(__dirname, 'files');
let totalBytesSent = 0;
let activeDownloads = 0;

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
