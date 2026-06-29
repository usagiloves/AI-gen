require('dotenv').config();
const { processTask } = require('../workers/taskWorker');

process.env.HEADLESS = 'false'; // Bật trình duyệt để xem
process.env.DOWNLOAD_TIMEOUT = '120000';

const testUrl = 'https://www.facebook.com/reel/1352374016840956';

async function runTest() {
    console.log('Đang chạy test với URL:', testUrl);
    try {
        await processTask({
            taskId: 'test-' + Date.now(),
            url: testUrl
        });
        console.log('Test hoàn thành.');
    } catch (error) {
        console.error('Test lỗi:', error);
    }
}

runTest();
