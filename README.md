# xclone_express

이 프로젝트는 [Xclone](https://github.com/seodevv/xclone) 웹 어플리케이션이 기반이 되는 백엔드 어플리케이션입니다.

- **Typescript**를 기반으로 작성되었으며, `express`로 **REST API**가 구현되어 있습니다.

- 웹 어플리케이션의 채팅을 위해 `/messages` 네임스페이스를 가지는 `socket.io` 서버도 함께 올라갑니다.

- **node**의 `cluster`를 사용 중입니다. `.env` 파일의 `MAX_WORKER`의 수를 지정해주면 하나의 *primary*와 `n`의 *worker*가 구동됩니다.(`MAX_WORKER`가 서버가 보유한 **cpus**보다 높은 경우 **cpus** 수량만큼 *worker*가 구동됩니다.)

- 데이터베이스는 [postgresql 16](https://www.postgresql.org/)을 사용하며, `.env` 파일에 접속 정보를 넣으면 서버가 최초로 실행될 때 필요한 DDL을 자동 생성합니다.

- 이 프로젝트는 [Epretx](https://epretx.etri.re.kr/)의 [언어 분석 기술](https://epretx.etri.re.kr/apiDetail?id=2) API를 사용합니다. 사용을 원하는 경우 `.env` 파일의 `AI_OPEN_ETRI_API_KEY`의 정보를 넣으면 해당 기능을 사용할 수 있습니다.

# Started

## required environment

```dotenv
# .env
PGUSER=xclone
PGPASSWORD=xclone
PGHOST=localhost
PGPORT=5432
PGDATABASE=xclone
PGSCHEMA=xclone_schema
```

이 프로젝트는 [Postgresql 16](https://www.postgresql.org/)을 기반으로 구동됩니다. 따라서 **Postgresql DB**의 **접속 정보**를 필요로 합니다.

- AWS RDS를 사용할 경우 **region**에 맞는 `pem` 파일과 함께 `PGSSL=true`를 활성화 해주어야 합니다.

## development

```bash
npm run dev
```

## production

```bash
npm run build
npm run start
```

## production with pm2

```bash
npm run build:restart
# or
npm run build
pm2 start pm2.config.js
```

# socket.io

[Xclone](https://github.com/seodevv/xclone)에서 사용되는 socket.io 서버가 구현되어 있습니다.

- express 서버 구동 시 자동으로 구동되며, 동일한 도메인을 사용합니다.
- 네임스페이스는 `/messages`를 사용합니다.
  ```bash
    [server ip]:[server port]/messages
  ```
- 클라이언트에서 `io` 정의 시 `auth.sessionid`에 현재 로그인 중인 sessionid를 담아 선언합니다.

### client-side

```ts
import { io } from 'socket.io-client';

io('[server ip]:[server port]/messages', {
  auth: {
    sessionid: id,
  },
});
```

# cluster

# Epretx
