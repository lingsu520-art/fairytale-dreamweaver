const China_Core = require('@alicloud/pop-core');

// 从环境变量读取配置
const stsClient = new China_Core({
  accessKeyId: process.env.ACCESS_KEY_ID,
  accessKeySecret: process.env.ACCESS_KEY_SECRET,
  endpoint: 'https://sts.aliyuncs.com',
  apiVersion: '2015-04-01',
});

exports.handler = async function(request, response, context) {
  // 设置 CORS 头
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.setStatusCode(204);
    return response.send('');
  }

  // 健康检查
  if (request.path === '/health') {
    response.setHeader('Content-Type', 'application/json');
    return response.send(Buffer.from(JSON.stringify({ status: 'ok' })));
  }

  // STS Token 接口
  if (request.path === '/sts-token' || request.path === '/') {
    try {
      const result = await stsClient.request('AssumeRole', {
        RoleArn: process.env.ROLE_ARN,
        RoleSessionName: 'fairytale-web-upload',
        DurationSeconds: 3600,
      }, { method: 'POST' });

      const cred = result.Credentials;
      response.setHeader('Content-Type', 'application/json');
      return response.send(Buffer.from(JSON.stringify({
        accessKeyId: cred.AccessKeyId,
        accessKeySecret: cred.AccessKeySecret,
        stsToken: cred.SecurityToken,
        expiration: cred.Expiration,
      })));
    } catch (err) {
      console.error('STS error:', err.message);
      response.setStatusCode(500);
      response.setHeader('Content-Type', 'application/json');
      return response.send(Buffer.from(JSON.stringify({ error: 'Failed to get STS token', message: err.message })));
    }
  }

  response.setStatusCode(404);
  return response.send(Buffer.from('Not Found'));
};

