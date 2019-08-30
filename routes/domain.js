require('dotenv').config();
const express = require('express');
const router = express.Router();
const axios = require('axios');
const MongoClient = require('mongodb').MongoClient;
const MONGODB_URL = process.env.MONGODB_URL;
const MONGODB_DB = process.env.MONGODB_DB;

(async () => {

  // 连接数据库
  const client = new MongoClient(MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  try {
    await client.connect();
  } catch (err) {
    console.log(err.stack);
    res.status(500).send(JSON.stringify({
      msg: '连接数据库失败'
    }));
  }
  const db = client.db(MONGODB_DB);
  const col = db.collection('domain');

  // 路由注册
  router.get('/:domain', async (req, res) => {
    const domain = req.params.domain;
    try {
      const data = await col.find({
        domain: domain
      }).project({
        _id: 0
      }).limit(1).toArray();

      if (data.length > 0) {
        res.send(JSON.stringify({
          msg: '获取主域名成功',
          data: data[0]
        }));
      } else {
        res.send(JSON.stringify({
          msg: '不存在主域名'
        }));
      }
    } catch (err) {
      handleError(err.stack, res, '获取主域名失败或超时');
    }
  });

  router.post('/', async (req, res) => {
    const data = req.body;
    data.pv = parseInt(data.pv);
    data.subs = await mutateSubs(data.pv, data.subs);

    if (data.subs.length > 0) {
      try {
        await col.replaceOne({
          domain: data.domain
        }, data, {
          upsert: true
        });
        res.send(JSON.stringify({
          msg: '添加/更新主域名成功'
        }));
      } catch (err) {
        handleError(err.stack, res, '添加/更新主域名失败');
      }
    } else {
      res.send(JSON.stringify({
        msg: '有效子域名数量为空，不添加/更新主域名'
      }));
    }
  });
  
  // 错误处理
  function handleError(stack, res, msg) {
    client.close();
    console.log(stack);
    res.status(500).send(JSON.stringify({
      msg: msg
    }));
  }
})();

// 子域名数据处理
async function mutateSubs(pv, subs) {

  // 文本拆分，计算 pv
  subs = subs.split(',');
  subs = subs.map(i => {
    const arr = i.split('#');
    const ratio = parseFloat(arr[1])
    return {
      subdomain: arr[0],
      ratio: ratio,
      pv: Math.round(pv * ratio * 0.01)
    }
  });

  // 计算曝光量
  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i];
    const record = await getBaiduRecord(sub.subdomain);
    
    if (record > 1) {
      sub.record = record;
      const factor = Math.log(record) / 16.712;
      sub.factor = parseFloat(factor.toFixed(3));
      sub.link = Math.ceil(record / (factor * 5796));
      sub.impress = Math.round((sub.pv * 0.05) / (sub.link * 0.95));
    }
  }
  
  subs = subs.filter(i => i.impress);
  return subs;
}

// 获取百度收录数
async function getBaiduRecord (site) {
  const options = {
    url: encodeURI(`https://www.baidu.com/s?wd=site:${site}`),
    method: 'GET',
    headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36'}
  }
  const r = await axios(options);
  const m1 = /该网站共有\s+<b\sstyle="color:#333">(.+)<\/b>/.exec(r.data);
  const m2 = /找到相关结果数约([\d|,]+)个/.exec(r.data);

  if (m1 || m2) {
    const recordText = m1 ? m1[1] : m2[1];
    if (recordText.indexOf('亿') != -1) {
      const m3 = /(\d+)亿(\d+)万/.exec(recordText);
      if (m3) {
        return parseInt(m3[1]) * 100000000 + parseInt(m3[2]) * 10000;
      } else {
        return -1;
      }
    } else {
      return parseInt(recordText.replace(/,/g, ''));
    }
  } else {
    return -1
  }
}

module.exports = router;
 