// Quick test: gửi request tạo task
const http = require('http');

const data = JSON.stringify({
  url: 'https://www.facebook.com/reel/1483315573235875'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/generate-script',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
  },
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    const result = JSON.parse(body);
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (result.task_id) {
      console.log(`\nTrack progress: http://localhost:3000/api/v1/task/${result.task_id}`);
    }
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(data);
req.end();
