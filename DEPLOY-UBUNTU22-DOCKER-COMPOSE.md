# MyEMS on Ubuntu 22.04 with Docker Compose

This checklist is adapted to the current host:

- OS: Ubuntu 22.04
- Docker CLI: installed
- Docker Compose plugin: installed
- Current host IP: 10.1.0.10
- Current user: `ubuntu`
- Current gaps: no Docker daemon access for `ubuntu`, no `mysql` client installed, no `npm` installed on host

## Recommended deployment mode

Use the official MyEMS Docker Compose structure with a host-local MySQL server.

Here, "host-local" means:

- MySQL runs directly on this Ubuntu 22.04 server
- MySQL is not part of the Docker Compose stack
- MyEMS containers connect from Docker to the MySQL service on the same machine
- MySQL should remain private even when Web and Admin are exposed publicly

For this host, the simplest production-like setup is:

- MySQL runs on the Ubuntu host itself
- MyEMS services run in Docker Compose
- Admin and Web are exposed on ports `8001` and `80`
- API is exposed on port `8000`
- Shared upload directory is `/myems-upload`

This is the target topology for this machine:

```text
Internet
	-> 80/443
	-> public reverse proxy
	-> MyEMS Web / MyEMS Admin containers
	-> MyEMS API container
	-> MySQL on the same Ubuntu host
```

For public internet exposure, do not treat that default port layout as the final security layout.

## Recommended public exposure topology

For public deployment, use this traffic model:

- Public users access `https://your-domain` for MyEMS Web
- Administrators access `https://admin.your-domain` for MyEMS Admin
- MySQL stays private and is never exposed to the public internet
- API is preferably private behind Web and Admin reverse proxy rules

Recommended exposure policy:

- Publicly expose only `80` and `443`
- Do not expose `3306` publicly
- Do not expose `8000` publicly unless you have a specific third-party integration requirement
- Do not expose `8001` publicly without at least IP allowlisting, VPN, or an additional authentication layer

If your server is behind a cloud public IP, NAT gateway, or load balancer:

- Point your DNS record to the public IP or load balancer address
- Forward only `80` and `443` to this Ubuntu host
- Keep `22` restricted to your office or bastion IP range

Official Compose file location in this repository:

- `others/docker-compose-on-linux.yml`

## Important behavior of the official Compose structure

1. The Compose file does not include MySQL. You must install and operate MySQL directly on this Ubuntu host.
2. The Compose file builds images from local source directories.
3. Component `.env` files are copied into images at build time, not mounted at runtime.
4. If you modify any `.env` or `nginx.conf`, you must rebuild with `docker compose up --build -d`.
5. For containers, `127.0.0.1` means the container itself, not the Ubuntu host.
6. Because MySQL runs on this same Ubuntu host, use `10.1.0.10` as the database host in MyEMS `.env` files.
7. The official Compose file is fine for internal service startup, but you should add a public HTTPS entry layer before exposing the system on the internet.

## Host-local MySQL design

For this deployment, MySQL is part of the same server, but not part of Compose.

That means:

- MySQL lifecycle is managed by `systemd`, not `docker compose`
- MySQL data stays under the host filesystem, not inside a container volume
- Database backup and restore should be handled at the host level
- MyEMS containers access MySQL over TCP using the host IP `10.1.0.10:3306`

Recommended model for this server:

- MySQL listens on the host so Docker containers can reach it
- Firewall prevents public internet access to `3306`
- MyEMS uses one dedicated database account instead of exposing public root access when possible

If you want a stricter production model than the official examples, prefer a dedicated account such as `myems` instead of `root`.

## Step 0: Fix host prerequisites

### 0.1 Fix Docker permission

The `ubuntu` user currently cannot access `/var/run/docker.sock`.

Run:

```bash
sudo usermod -aG docker ubuntu
newgrp docker
docker info
```

If `newgrp docker` does not fully refresh the session, log out and log back in.

### 0.2 Install MySQL server and client

The host currently does not have the `mysql` client.

Run:

```bash
sudo apt update
sudo apt install -y mysql-server mysql-client
```

Enable and start MySQL:

```bash
sudo systemctl enable mysql
sudo systemctl start mysql
sudo systemctl status mysql --no-pager
```

This MySQL service is expected to remain on the host permanently and serve all MyEMS containers on this same machine.

### 0.3 Create the host-local MySQL access model

You have two choices.

### Choice A: follow the official MyEMS examples

Use MySQL `root` with password `!MyEMS1`.

This is fast for initial deployment, but weaker from an operational security standpoint.

### Choice B: recommended for long-term use

Create a dedicated MyEMS MySQL account, for example `myems`, and use it in every component `.env` file.

This is the preferred model for a public-facing deployment.

### 0.4 Official-compatible root setup

Official Compose examples assume:

- user: `root`
- password: `!MyEMS1`

Run:

```bash
sudo mysql <<'SQL'
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '!MyEMS1';
CREATE USER IF NOT EXISTS 'root'@'10.%' IDENTIFIED WITH mysql_native_password BY '!MyEMS1';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'10.%' WITH GRANT OPTION;
CREATE USER IF NOT EXISTS 'root'@'172.%' IDENTIFIED WITH mysql_native_password BY '!MyEMS1';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'172.%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
SQL
```

Notes:

- The extra `root` host entries allow Docker bridge network clients to connect.
- If your security baseline forbids remote root access, create a dedicated MyEMS MySQL user instead and replace all `.env` values accordingly.

### 0.5 Recommended dedicated MySQL account setup

If you do not want MyEMS to use `root`, run:

```bash
sudo mysql <<'SQL'
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '!MyEMS1';
CREATE USER IF NOT EXISTS 'myems'@'10.%' IDENTIFIED BY 'CHANGE_THIS_TO_A_STRONG_PASSWORD';
CREATE USER IF NOT EXISTS 'myems'@'172.%' IDENTIFIED BY 'CHANGE_THIS_TO_A_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON myems_system_db.* TO 'myems'@'10.%';
GRANT ALL PRIVILEGES ON myems_user_db.* TO 'myems'@'10.%';
GRANT ALL PRIVILEGES ON myems_historical_db.* TO 'myems'@'10.%';
GRANT ALL PRIVILEGES ON myems_energy_db.* TO 'myems'@'10.%';
GRANT ALL PRIVILEGES ON myems_billing_db.* TO 'myems'@'10.%';
GRANT ALL PRIVILEGES ON myems_carbon_db.* TO 'myems'@'10.%';
GRANT ALL PRIVILEGES ON myems_energy_baseline_db.* TO 'myems'@'10.%';
GRANT ALL PRIVILEGES ON myems_energy_model_db.* TO 'myems'@'10.%';
GRANT ALL PRIVILEGES ON myems_energy_plan_db.* TO 'myems'@'10.%';
GRANT ALL PRIVILEGES ON myems_energy_prediction_db.* TO 'myems'@'10.%';
GRANT ALL PRIVILEGES ON myems_fdd_db.* TO 'myems'@'10.%';
GRANT ALL PRIVILEGES ON myems_reporting_db.* TO 'myems'@'10.%';
GRANT ALL PRIVILEGES ON myems_production_db.* TO 'myems'@'10.%';
GRANT ALL PRIVILEGES ON myems_system_db.* TO 'myems'@'172.%';
GRANT ALL PRIVILEGES ON myems_user_db.* TO 'myems'@'172.%';
GRANT ALL PRIVILEGES ON myems_historical_db.* TO 'myems'@'172.%';
GRANT ALL PRIVILEGES ON myems_energy_db.* TO 'myems'@'172.%';
GRANT ALL PRIVILEGES ON myems_billing_db.* TO 'myems'@'172.%';
GRANT ALL PRIVILEGES ON myems_carbon_db.* TO 'myems'@'172.%';
GRANT ALL PRIVILEGES ON myems_energy_baseline_db.* TO 'myems'@'172.%';
GRANT ALL PRIVILEGES ON myems_energy_model_db.* TO 'myems'@'172.%';
GRANT ALL PRIVILEGES ON myems_energy_plan_db.* TO 'myems'@'172.%';
GRANT ALL PRIVILEGES ON myems_energy_prediction_db.* TO 'myems'@'172.%';
GRANT ALL PRIVILEGES ON myems_fdd_db.* TO 'myems'@'172.%';
GRANT ALL PRIVILEGES ON myems_reporting_db.* TO 'myems'@'172.%';
GRANT ALL PRIVILEGES ON myems_production_db.* TO 'myems'@'172.%';
FLUSH PRIVILEGES;
SQL
```

If you choose this model, replace all MySQL usernames and passwords in every MyEMS `.env` file.

### 0.6 Allow host-local MySQL to listen for Docker clients

Check the bind address:

```bash
sudo grep -R "bind-address" /etc/mysql/mysql.conf.d /etc/mysql/mariadb.conf.d 2>/dev/null
```

If MySQL is bound only to `127.0.0.1`, change it to:

```text
bind-address = 0.0.0.0
```

Then restart:

```bash
sudo systemctl restart mysql
```

Verify:

```bash
ss -lnt | grep 3306
mysql -h 127.0.0.1 -u root -p'!MyEMS1' -e 'SELECT VERSION();'
```

For this architecture, `0.0.0.0` is acceptable only if your firewall blocks public access to `3306`.

The security boundary for MySQL here is:

- `mysqld` listens for local Docker clients
- `ufw` or cloud firewall blocks internet-originated traffic to `3306`

## Step 1: Prepare MyEMS working paths

Use these paths on this server:

- repository: `/home/ubuntu/myems`
- upload directory: `/myems-upload`

Create the upload directory:

```bash
sudo mkdir -p /myems-upload
sudo chown -R ubuntu:ubuntu /myems-upload
```

## Step 2: Import the 13 MyEMS databases

Change to the SQL install directory:

```bash
cd /home/ubuntu/myems/database/install
```

Import all schema files in this order:

```bash
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_system_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_user_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_historical_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_energy_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_billing_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_carbon_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_energy_baseline_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_energy_model_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_energy_plan_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_energy_prediction_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_fdd_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_reporting_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_production_db.sql
```

Optional demo data import:

```bash
mysql -h 127.0.0.1 -u root -p'!MyEMS1' myems_system_db < /home/ubuntu/myems/database/demo-en/myems_system_db.sql
```

If you want a Chinese seed set instead, replace `demo-en` with `demo-cn`.

## Step 3: Create service `.env` files

Official components that require `.env` for the Compose deployment:

- `myems-api/.env`
- `myems-aggregation/.env`
- `myems-cleaning/.env`
- `myems-modbus-tcp/.env`
- `myems-normalization/.env`

Create them from the examples:

```bash
cd /home/ubuntu/myems
cp myems-api/example.env myems-api/.env
cp myems-aggregation/example.env myems-aggregation/.env
cp myems-cleaning/example.env myems-cleaning/.env
cp myems-modbus-tcp/example.env myems-modbus-tcp/.env
cp myems-normalization/example.env myems-normalization/.env
```

### 3.1 Replace all database hosts

Because MySQL runs on this same Ubuntu host, replace every `127.0.0.1` database host with:

```text
10.1.0.10
```

This applies to:

- `MYEMS_SYSTEM_DB_HOST`
- `MYEMS_HISTORICAL_DB_HOST`
- `MYEMS_ENERGY_DB_HOST`
- `MYEMS_BILLING_DB_HOST`
- `MYEMS_CARBON_DB_HOST`
- `MYEMS_USER_DB_HOST`
- `MYEMS_FDD_DB_HOST`
- `MYEMS_REPORTING_DB_HOST`
- `MYEMS_PRODUCTION_DB_HOST`
- `MYEMS_ENERGY_BASELINE_DB_HOST`
- `MYEMS_ENERGY_PLAN_DB_HOST`
- `MYEMS_ENERGY_PREDICTION_DB_HOST`

Keep the database user and password aligned with the MySQL setup.

If you use the recommended dedicated MySQL account, also replace all `*_USER=root` and `*_PASSWORD=!MyEMS1` values with the dedicated credentials.

### 3.2 API `.env` values to verify

In `/home/ubuntu/myems/myems-api/.env`, verify at least:

```text
MYEMS_SYSTEM_DB_HOST=10.1.0.10
MYEMS_ENERGY_DB_HOST=10.1.0.10
MYEMS_HISTORICAL_DB_HOST=10.1.0.10
MYEMS_USER_DB_HOST=10.1.0.10
MYEMS_FDD_DB_HOST=10.1.0.10
MYEMS_REPORTING_DB_HOST=10.1.0.10
MYEMS_CARBON_DB_HOST=10.1.0.10
MYEMS_BILLING_DB_HOST=10.1.0.10
MYEMS_PRODUCTION_DB_HOST=10.1.0.10
MYEMS_ENERGY_BASELINE_DB_HOST=10.1.0.10
MYEMS_ENERGY_PLAN_DB_HOST=10.1.0.10
MYEMS_ENERGY_PREDICTION_DB_HOST=10.1.0.10
UPLOAD_PATH=/var/www/myems-admin/upload/
UTC_OFFSET=+08:00
```

Adjust `UTC_OFFSET` if your deployment is not in UTC+8.

### 3.3 Aggregation, Cleaning, Normalization

Verify the same host replacement in:

- `/home/ubuntu/myems/myems-aggregation/.env`
- `/home/ubuntu/myems/myems-cleaning/.env`
- `/home/ubuntu/myems/myems-normalization/.env`

Also review these fields:

- `MINUTES_TO_COUNT=60`
- `START_DATETIME_UTC="2024-12-31 16:00:00"`
- `POOL_SIZE=5`
- `LIVE_IN_DAYS=365`

If this is a fresh deployment, you can keep the defaults first and tune later.

### 3.4 Modbus TCP `.env`

Verify in `/home/ubuntu/myems/myems-modbus-tcp/.env`:

- `MYEMS_SYSTEM_DB_HOST=10.1.0.10`
- `MYEMS_HISTORICAL_DB_HOST=10.1.0.10`
- `GATEWAY_ID=1`
- `GATEWAY_TOKEN=...`

Important:

- `GATEWAY_TOKEN` must match the gateway token created in MyEMS Admin.
- On a brand new install, you may need to first log in to Admin, create or inspect the gateway, then update this file and rebuild the container.

## Step 4: Fix admin and web reverse proxy targets

The stock configs currently proxy `/api` to `http://127.0.0.1:8000/`.

Inside containers, that points to the same container, not the API container.

For Docker Compose on a single Compose network, change both files to use the service name:

```text
proxy_pass http://api:8000/;
```

Files:

- `/home/ubuntu/myems/myems-admin/nginx.conf`
- `/home/ubuntu/myems/myems-web/nginx.conf`

Do not keep `127.0.0.1:8000` here for Compose.

## Step 5: Use the official Linux Compose file from `others`

The official Linux Compose file is not in the repository root. It is here:

```text
/home/ubuntu/myems/others/docker-compose-on-linux.yml
```

Its services are:

- `api`
- `aggregation`
- `cleaning`
- `modbus_tcp`
- `normalization`
- `admin`
- `web`

The file builds these local directories:

- `../myems-api`
- `../myems-aggregation`
- `../myems-cleaning`
- `../myems-modbus-tcp`
- `../myems-normalization`
- `../myems-admin`
- `../myems-web`

That means you should execute Compose from the `others` directory.

## Step 5.1: Decide how public traffic will enter the server

For internet use, there are two workable patterns.

### Option A: Public reverse proxy on the host

Recommended for this server.

- Keep MyEMS containers running on host ports `80`, `8000`, and `8001` during initial validation
- After validation, move public entry to a host-level reverse proxy such as Nginx or Caddy
- Publish only `80` and `443` externally
- Proxy `https://your-domain` to `127.0.0.1:80`
- Proxy `https://admin.your-domain` to `127.0.0.1:8001`
- Optionally proxy `https://api.your-domain` to `127.0.0.1:8000` only if external API access is required

### Option B: Directly expose MyEMS ports

This is simpler, but less suitable for production.

- Expose Web on `80`
- Expose Admin on `8001`
- Expose API on `8000` only if required
- Add HTTPS separately with a fronting proxy later

If this service is intended for long-term public use, prefer Option A.

## Step 6: Build and start MyEMS

Run:

```bash
cd /home/ubuntu/myems/others
docker compose -f docker-compose-on-linux.yml up --build -d
```

If your user still has no Docker permission, temporarily run:

```bash
sudo docker compose -f /home/ubuntu/myems/others/docker-compose-on-linux.yml up --build -d
```

If you plan to put a host-level reverse proxy on `80` and `443`, you may later want to change the Compose published ports so Web and Admin bind only to localhost or alternate host ports. The initial official setup can stay unchanged until functional verification is complete.

## Step 7: Verify containers and endpoints

Check service status:

```bash
cd /home/ubuntu/myems/others
docker compose -f docker-compose-on-linux.yml ps
docker compose -f docker-compose-on-linux.yml logs --tail=100 api
docker compose -f docker-compose-on-linux.yml logs --tail=100 admin
docker compose -f docker-compose-on-linux.yml logs --tail=100 web
```

Verify endpoints:

```bash
curl http://127.0.0.1:8000/version
curl -I http://127.0.0.1:8001
curl -I http://127.0.0.1/
```

Expected ports:

- Web: `80`
- API: `8000`
- Admin: `8001`

Default credentials:

- username: `administrator`
- password: `!MyEMS1`

## Step 8: Plan public domain and HTTPS

Before going public, prepare:

- a domain such as `your-domain.com`
- a Web hostname such as `your-domain.com`
- an Admin hostname such as `admin.your-domain.com`
- optionally an API hostname such as `api.your-domain.com`

Recommended TLS approach:

- Use a host-level reverse proxy with automatic Let's Encrypt certificates
- Caddy is the simplest operational choice
- Nginx plus Certbot is also fine if you prefer explicit control

Example public routing target:

- `your-domain.com` -> `127.0.0.1:80`
- `admin.your-domain.com` -> `127.0.0.1:8001`
- `api.your-domain.com` -> `127.0.0.1:8000` only if needed

For Admin, add at least one of these controls:

- source IP allowlist
- VPN-only access
- additional basic authentication on the public reverse proxy

## Step 9: Open firewall with a public-safe policy

If `ufw` is enabled on this server:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

Do not open `3306` publicly.

This server design assumes MySQL is local to this host and reachable only by local Docker clients and approved administrative sessions.

Do not open `8000` publicly unless you explicitly need an external API endpoint.

Do not open `8001` publicly by default. If Admin must be internet-accessible, protect it with source IP restriction or a reverse proxy authentication layer.

If you must temporarily expose Admin directly:

```bash
sudo ufw allow from YOUR.PUBLIC.IP.ADDRESS to any port 8001 proto tcp
```

For SSH, also restrict access if possible:

```bash
sudo ufw allow from YOUR.PUBLIC.IP.ADDRESS to any port 22 proto tcp
```

## Common failure points on this host

### 1. API cannot connect to MySQL

Usually caused by one of these:

- `.env` still uses `127.0.0.1`
- MySQL is not actually running on this host
- MySQL is still bound to localhost only
- MySQL user host permissions do not allow Docker bridge clients
- wrong password in one or more service `.env` files

### 2. Admin or Web loads, but API calls fail

Usually caused by:

- `myems-admin/nginx.conf` still points to `127.0.0.1:8000`
- `myems-web/nginx.conf` still points to `127.0.0.1:8000`

For Compose, both should proxy to `api:8000`.

### 3. `.env` changes do not take effect

That is expected with the official Compose structure, because the `.env` files are copied into images during build.

Apply changes with:

```bash
cd /home/ubuntu/myems/others
docker compose -f docker-compose-on-linux.yml up --build -d
```

### 4. `modbus_tcp` cannot collect data

Usually caused by:

- `GATEWAY_ID` mismatch
- `GATEWAY_TOKEN` mismatch
- gateway not configured in Admin
- source devices are unreachable from the container network

### 5. The service is reachable publicly but unsafe

Usually caused by:

- `3306` opened to the internet
- `8001` exposed without restriction
- `8000` exposed without a real external integration need
- no HTTPS in front of Web or Admin
- SSH open to the whole internet without rate limiting or IP restriction

## Recommended execution order on this server

1. Fix Docker permissions.
2. Install MySQL server and client.
3. Set MySQL root password and host access.
4. If this is a long-term public deployment, create a dedicated MySQL account for MyEMS.
4. Import the 13 database schemas.
5. Create all MyEMS `.env` files.
6. Replace database host values with `10.1.0.10`.
7. Change both Nginx proxy targets to `api:8000`.
8. Create `/myems-upload`.
9. Run `docker compose -f docker-compose-on-linux.yml up --build -d` from `/home/ubuntu/myems/others`.
10. Verify `/version`, Admin, and Web login.
11. Put a public reverse proxy with HTTPS in front of Web and Admin.
12. Open only `80` and `443` publicly.

## Minimal command checklist

```bash
sudo usermod -aG docker ubuntu
newgrp docker

sudo apt update
sudo apt install -y mysql-server mysql-client
sudo systemctl enable mysql
sudo systemctl start mysql

sudo mysql <<'SQL'
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '!MyEMS1';
CREATE USER IF NOT EXISTS 'root'@'10.%' IDENTIFIED WITH mysql_native_password BY '!MyEMS1';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'10.%' WITH GRANT OPTION;
CREATE USER IF NOT EXISTS 'root'@'172.%' IDENTIFIED WITH mysql_native_password BY '!MyEMS1';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'172.%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
SQL

sudo mkdir -p /myems-upload
sudo chown -R ubuntu:ubuntu /myems-upload

cd /home/ubuntu/myems
cp myems-api/example.env myems-api/.env
cp myems-aggregation/example.env myems-aggregation/.env
cp myems-cleaning/example.env myems-cleaning/.env
cp myems-modbus-tcp/example.env myems-modbus-tcp/.env
cp myems-normalization/example.env myems-normalization/.env

cd /home/ubuntu/myems/database/install
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_system_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_user_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_historical_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_energy_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_billing_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_carbon_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_energy_baseline_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_energy_model_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_energy_plan_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_energy_prediction_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_fdd_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_reporting_db.sql
mysql -h 127.0.0.1 -u root -p'!MyEMS1' < myems_production_db.sql

cd /home/ubuntu/myems/others
docker compose -f docker-compose-on-linux.yml up --build -d
docker compose -f docker-compose-on-linux.yml ps
curl http://127.0.0.1:8000/version
```

## Public internet checklist

Use this checklist before announcing the service publicly:

1. Domain DNS points to your public IP or load balancer.
2. Only `80` and `443` are open to the internet.
3. `3306` is not publicly reachable.
4. `8001` is not publicly reachable, or is restricted by IP or extra auth.
5. `8000` is not publicly reachable unless intentionally published.
6. HTTPS certificate is valid.
7. Web is reachable through the public domain.
8. Admin is reachable only through your intended protected route.
9. SSH is restricted to trusted IPs if feasible.

## Suggested final public architecture

For this server, the most reasonable steady-state internet architecture is:

- MySQL on this host, managed by systemd, private only
- MyEMS Compose services running locally
- Host-level reverse proxy handling TLS and public routing
- Public access only on `80` and `443`
- Admin behind `admin.your-domain.com` with IP restriction or VPN
- API kept private unless a real external caller requires it

## Final recommendation

Before you deploy publicly, make these four changes first:

1. Change every database host in all MyEMS `.env` files from `127.0.0.1` to `10.1.0.10`.
2. Change both Nginx proxy configs from `http://127.0.0.1:8000/` to `http://api:8000/`.
3. Do not expose `3306` and `8001` directly to the public internet.
4. Put `80` and `443` behind a domain and TLS-enabled reverse proxy.

Those four changes are the highest-priority items for making the official Compose structure usable and safer on this host.