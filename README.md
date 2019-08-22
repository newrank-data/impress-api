# 曝光量计算工具接口
## 路由
- index（主页，简要说明）
- subdomain
  - GET
    - /（返回所有子域名数据）
    - /:a.example.com（返回 a.example.com 的数据）
  - POST
    - /:b.example.com（添加/修改 b.example.com 的数据）