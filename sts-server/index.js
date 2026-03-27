// ============================================
// STS Token Service — 零依赖 Web 函数版本
// 适用于 FC3 Web 函数模式
// ============================================

const crypto = require('crypto');
const https = require('https');
const http = require('http');

// ---------- 阿里云 STS 签名 ----------

function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

function signRequest(params, accessKeySecret) {
  const sortedKeys = Object.keys(params).sort();
  const canonicalized = sortedKeys
    .map(k => percentEncode(k) + '=' + percentEncode(params[k]))
    .join('&');
  const stringToSign = 'GET&' + percentEncode('/') + '&' + percentEncode(canonicalized);
  const hmac = crypto.createHmac('sha1', accessKeySecret + '&');
  hmac.update(stringToSign);
  return hmac.digest('base64');
}

function callStsApi(akId, akSecret, roleArn) {
  return new Promise(function(resolve, reject) {
    var params = {
      Action: 'AssumeRole',
      RoleArn: roleArn,
      RoleSessionName: 'fairytale-web-upload',
      DurationSeconds: '3600',
      Format: 'JSON',
      Version: '2015-04-01',
      AccessKeyId: akId,
      SignatureMethod: 'HMAC-SHA1',
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      SignatureVersion: '1.0',
      SignatureNonce: crypto.randomBytes(16).toString('hex'),
    };
    params.Signature = signRequest(params, akSecret);

    var query = Object.keys(params)
      .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');

    https.get('https://sts.aliyuncs.com/?' + query, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var json = JSON.parse(data);
          if (json.Credentials) {
            resolve(json);
          } else {
            reject(new Error(json.Message || data));
          }
        } catch (e) {
          reject(new Error('Invalid response: ' + data.substring(0, 200)));
        }
      });
    }).on('error', reject);
  });
}

// ---------- HTTP 服务器 ----------

var PORT = process.env.FC_SERVER_PORT || 9000;

var server = http.createServer(function(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  var path = req.url.split('?')[0];

  // 健康检查
  if (path === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // STS Token
  if (path === '/sts-token' || path === '/') {
    var akId = process.env.ACCESS_KEY_ID;
    var akSecret = process.env.ACCESS_KEY_SECRET;
    var roleArn = process.env.ROLE_ARN;

    if (!akId || !akSecret || !roleArn) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Missing env vars', hint: 'Set ACCESS_KEY_ID, ACCESS_KEY_SECRET, ROLE_ARN' }));
      return;
    }

    callStsApi(akId, akSecret, roleArn)
      .then(function(result) {
        var cred = result.Credentials;
        res.writeHead(200);
        res.end(JSON.stringify({
          accessKeyId: cred.AccessKeyId,
          accessKeySecret: cred.AccessKeySecret,
          stsToken: cred.SecurityToken,
          expiration: cred.Expiration,
        }));
      })
      .catch(function(err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'STS call failed', message: err.message }));
      });
    return;
  }

  // 图片生成 - 提交任务
  if (path === '/image/generate' && req.method === 'POST') {
    var dashscopeApiKey = process.env.DASHSCOPE_API_KEY;
    if (!dashscopeApiKey) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Missing DASHSCOPE_API_KEY env var' }));
      return;
    }

    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        var payload = JSON.parse(body);
        proxyDashScopeImageGenerate(dashscopeApiKey, payload, res);
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // 图片生成 - 查询任务状态
  var taskMatch = path.match(/^\/image\/task\/(.+)$/);
  if (taskMatch && req.method === 'GET') {
    var dashscopeApiKey = process.env.DASHSCOPE_API_KEY;
    if (!dashscopeApiKey) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Missing DASHSCOPE_API_KEY env var' }));
      return;
    }

    var taskId = taskMatch[1];
    proxyDashScopeTaskQuery(dashscopeApiKey, taskId, res);
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, function() {
  console.log('STS server listening on port ' + PORT);
});

// ---------- DashScope 图片生成代理 ----------

function proxyDashScopeImageGenerate(apiKey, payload, res) {
  var postData = JSON.stringify({
    model: payload.model || 'wanx2.1-t2i-turbo',
    input: {
      prompt: payload.prompt || ''
    },
    parameters: {
      size: payload.size || '1024*1024',
      n: payload.n || 1
    }
  });

  var options = {
    hostname: 'dashscope.aliyuncs.com',
    port: 443,
    path: '/api/v1/services/aigc/text2image/image-synthesis',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
      'X-DashScope-Async': 'enable',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  var proxyReq = https.request(options, function(proxyRes) {
    var data = '';
    proxyRes.on('data', function(chunk) { data += chunk; });
    proxyRes.on('end', function() {
      res.writeHead(proxyRes.statusCode);
      res.end(data);
    });
  });

  proxyReq.on('error', function(err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Proxy request failed', message: err.message }));
  });

  proxyReq.write(postData);
  proxyReq.end();
}

function proxyDashScopeTaskQuery(apiKey, taskId, res) {
  var options = {
    hostname: 'dashscope.aliyuncs.com',
    port: 443,
    path: '/api/v1/tasks/' + encodeURIComponent(taskId),
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + apiKey
    }
  };

  var proxyReq = https.request(options, function(proxyRes) {
    var data = '';
    proxyRes.on('data', function(chunk) { data += chunk; });
    proxyRes.on('end', function() {
      res.writeHead(proxyRes.statusCode);
      res.end(data);
    });
  });

  proxyReq.on('error', function(err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Proxy request failed', message: err.message }));
  });

  proxyReq.end();
}
