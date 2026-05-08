# GitHub Actions 预构建镜像配置

本文档用于把 MyEMS 的发布构建从生产机迁移到 GitHub Actions。目标是让生产机只做 `pull` 或 `docker load`，不再现场执行 `docker compose build`。

## 1. 适用方案

仓库已经具备以下生产侧约定：

1. 生产镜像模板使用 `others/docker-compose-on-linux.image.yml`
2. 镜像标签文件使用 `others/docker-images.env`
3. 生产发布使用 `docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build`

本次新增的是 CI 侧自动预构建：

1. 工作流文件：`.github/workflows/prebuild-images.yml`
2. 标签文件生成脚本：`scripts/render-docker-images-env.sh`

## 2. 默认行为

工作流会预构建并推送以下镜像：

1. `api`
2. `aggregation`
3. `cleaning`
4. `modbus-tcp`
5. `mqtt`
6. `normalization`
7. `admin`
8. `web`

EMQX 默认不重新构建，只把指定镜像引用写入 `docker-images.env`。

默认镜像前缀是：

```text
ghcr.io/<github-owner-lowercase>/myems
```

默认标签规则：

1. 手动触发且填写 `release_tag` 时，使用填写值
2. Git tag 触发时，使用 tag 名称
3. 其他情况下，使用当前短 SHA

## 3. 需要的 GitHub 配置

### 3.1 使用 GHCR 时

如果你直接使用 GitHub Container Registry，一般不需要额外密码：

1. 仓库 Actions 权限允许写 Packages
2. 工作流权限保留 `packages: write`

建议检查仓库设置：

1. `Settings` -> `Actions` -> `General`
2. `Workflow permissions` 选择 `Read and write permissions`

### 3.2 使用其他私有仓库时

如果你不用 GHCR，而是阿里云 ACR、Harbor 或腾讯云 TCR，需要改两处：

1. 手动触发时传入 `registry_prefix`
2. 把 `.github/workflows/prebuild-images.yml` 中的登录步骤替换为对应仓库登录方式

例如 Harbor 常见做法：

1. 新增 `REGISTRY_USERNAME`
2. 新增 `REGISTRY_PASSWORD`
3. 新增一个 `docker/login-action` 步骤登录你的私有仓库域名

## 4. 推荐触发方式

当前工作流支持两种触发：

1. 手动触发 `workflow_dispatch`
2. 推送 `v*` tag 时自动触发

推荐发布流程：

```bash
git tag v6.3.6-prod
git push origin v6.3.6-prod
```

这样 Actions 会自动构建并推送：

```text
ghcr.io/<owner>/myems/web:v6.3.6-prod
ghcr.io/<owner>/myems/api:v6.3.6-prod
...
```

并产出一个 artifact，其中至少包含：

1. `docker-images.env`
2. `image-manifest.txt`

## 5. 生产机如何使用

生产机不再执行 build，只拉取镜像并启动。

### 5.1 在线拉取方式

把 Actions 产出的 `docker-images.env` 放到生产机 `others/` 目录：

```bash
cd /home/ubuntu/myems-complete/others
cp /path/from-actions/docker-images.env ./docker-images.env
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml pull web admin api aggregation cleaning normalization modbus_tcp myems_mqtt
sudo docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build web admin api aggregation cleaning normalization modbus_tcp myems_mqtt
```

### 5.2 低内存生产机建议

即使切到预构建镜像，低内存生产机仍建议分批发布：

1. 先 `web`
2. 再 `admin`
3. 再 `api`
4. 最后后台服务

因为这样仍然更容易定位问题，也更适合与你当前的停机升级 SOP 对齐。

## 6. 首次启用时的建议检查

第一次启用工作流后，建议核对以下事项：

1. `Packages` 页面里是否已经出现 8 个镜像仓库
2. `docker-images.env` 中的镜像前缀是否与生产拉取地址一致
3. 生产机是否可以访问对应 registry
4. 生产机是否已经完成 `docker login`
5. `web` 镜像是否能在生产机上直接 `pull` 下来

## 7. 你下一步最可能要改的地方

如果你准备正式启用，通常只需要继续做这三件事：

1. 把 GitHub 仓库 Actions 权限改成 `Read and write permissions`
2. 决定镜像仓库前缀用 `ghcr.io/<owner>/myems` 还是你自己的企业镜像仓库
3. 用一个测试 tag 跑通一次完整流程，例如 `v6.3.6-rc1`