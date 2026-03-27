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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, function() {
  console.log('STS server listening on port ' + PORT);
});
