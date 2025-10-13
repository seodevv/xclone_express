# xclone_express

이 프로젝트는 [XClone](https://github.com/seodevv/xclone) 웹 어플리케이션이 기반이 되는 백엔드 어플리케이션입니다.

- **Typescript**를 기반으로 작성되었으며, `express`로 **REST API**가 구현되어 있습니다.

- 웹 어플리케이션의 채팅을 위해 `/messages` 네임스페이스를 가지는 `socket.io` 서버도 함께 올라갑니다.

- **node**의 `cluster`를 사용 중입니다. `.env` 파일의 `MAX_WORKER`의 수를 지정해주면 하나의 *primary*와 `n`의 *worker*가 구동됩니다.(`MAX_WORKER`가 서버가 보유한 **cpus**보다 높은 경우 **cpus** 수량만큼 *worker*가 구동됩니다.)

- 데이터베이스는 [PostgreSQL 16](https://www.postgresql.org/)을 사용하며, `.env` 파일에 접속 정보를 넣으면 서버가 최초로 실행될 때 필요한 DDL을 자동 생성합니다.

- 이 프로젝트는 [Epretx](https://epretx.etri.re.kr/)의 [언어 분석 기술](https://epretx.etri.re.kr/apiDetail?id=2) API를 사용합니다. 사용을 원하는 경우 `.env` 파일의 `AI_OPEN_ETRI_API_KEY`의 정보를 넣으면 해당 기능을 사용할 수 있습니다.

- 테스팅 툴로 `JEST`를 사용합니다. 해당 툴을 활용해 구현되어 있는 REST API 전부를 테스팅할 수 있습니다.

# Started

### required environment

```dotenv
# .env
PGSSL=false
PGUSER=xclone
PGPASSWORD=xclone
PGHOST=localhost
PGPORT=5432
PGDATABASE=xclone
PGSCHEMA=xclone_schema
```

이 프로젝트는 [PostgreSQL 16](https://www.postgresql.org/)을 기반으로 구동됩니다. 따라서 **PostgreSQL DB**의 **접속 정보**를 필요로 합니다.

- AWS RDS를 사용할 경우 **region**에 맞는 `pem` 파일과 함께 `PGSSL=true`를 활성화 해주어야 합니다.

### development

```bash
npm run dev
```

### production

```bash
npm run build
npm run start
```

### production with pm2

```bash
npm run build:restart
# or
npm run build
pm2 start pm2.config.js
```

# environment

이 프로젝트는 `.env` 파일에 아래와 같은 변수들을 가집니다.

```dotenv
### Node environment
NODE_ENV=development

### Server environment
SERVER_HOST=localhost
SERVER_PORT=9090
SERVER_ORIGIN=https://localhost,https://localhost:3000

## Postgres DB
## if use AWS RDS, must use ssl.
# PGSSL=true
# PGHOST=ap-northeast-2.rds.amazonaws.com
PGHOST=localhost
PGPORT=5432
PGDATABASE=xclone
PGSCHEMA=xclone_schema
PGUSER=xclone
PGPASSWORD=xclone

## jwt token secret
JWT_SECRET=secret

### epretx.etri.re.kr
AI_OPEN_ETRI_API_URL=http://epretx.etri.re.kr:8000/api/WiseNLU_spoken
AI_OPEN_ETRI_API_KEY=
```

| variable             | description                                                                                       | values                                           |
| :------------------- | :------------------------------------------------------------------------------------------------ | :----------------------------------------------- |
| NODE_ENV             | 노드의 상태를 나타냅니다.                                                                         | development<br>production<br>test                |
| SERVER_HOST          | 서버의 호스트 주소를 나타냅니다.                                                                  | localhost<br>0.0.0.0                             |
| SERVER_PORT          | 서버의 포트 주소를 나타냅니다.                                                                    | 9090                                             |
| SERVER_ORIGIN        | CORS 정책의 `origin`을 설정합니다. 다수를 설정할 경우 `,` 로 구분할 수 있습니다.                  | https://localhost, https://localhost:3000        |
| MAX_WORKER           | 서버의 최대 _worker_ 수를 나타냅니다. `os`의 `cpus`를 넘어갈 경우 `cpus`만큼 worker가 지정됩니다. | 4                                                |
| PGSSL                | DB 접속 시 SSL 사용 여부를 나타냅니다.                                                            | true, false                                      |
| PGHOST               | DB 호스트 주소를 나타냅니다.                                                                      | localhost                                        |
| PGPORT               | DB 접속 포트를 나타냅니다.                                                                        | 5432                                             |
| PGDATABASE           | 접속할 DB 명을 나타냅니다.                                                                        | xclone                                           |
| PGSCHEMA             | 사용할 DB 스키마 명을 나타냅니다.                                                                 | xclone_schema                                    |
| PGUSER               | DB 접속에 사용할 아이디를 나타냅니다.                                                             | postgres                                         |
| PGPASSWORD           | DB 접속에 사용할 패스워드를 나타냅니다.                                                           | postgres                                         |
| JWT_SECRET           | `jsonwebtoken`에서 사용할 SECRET을 나타냅니다.                                                    | secret                                           |
| AI_OPEN_ETRI_API_URL | [Epretx](https://epretx.etri.re.kr) API 서비스의 요청 URL을 나타냅니다.                           | http://epretx.etri.re.kr:8000/api/WiseNLU_spoken |
| AI_OPEN_ETRI_API_KEY | [Epretx](https://epretx.etri.re.kr) API 서비스를 사용하기 위한 *KEY*를 나타냅니다.                |                                                  |

# socket.io

[XClone](https://github.com/seodevv/xclone)에서 사용되는 `socket.io` 서버가 구현되어 있습니다.

- `express` 서버 구동 시 자동으로 구동되며, 동일한 도메인을 사용합니다.
- 네임스페이스는 `/messages`를 사용합니다.

  ```bash
    [server ip]:[server port]/messages
  ```

- 클라이언트에서 `io` 정의 시 `auth.sessionid`에 현재 로그인 중인 sessionid를 담아 선언합니다.

  ### client-side

  ```ts
  import { io } from 'socket.io-client';

  const myid = 'seodevv';
  const socket = io('[server ip]:[server port]/messages', {
    auth: {
      sessionid: myid,
    },
  });
  ```

# cluster

`node`의 `cluster`를 사용하여 다수의 *worker*로 서버를 구동할 수 있습니다.

- `.env`의 `MAX_WORKER` 변수에 따라 _worker_ 수를 지정할 수 있습니다.

  ```dotenv
  # .env
  MAX_WORKER=4
  ```

  - `MAX_WORKER`가 `os`의 `cpus`보다 많을 경우 `cpus`의 수 만큼 *worker*가 구동됩니다.

- *worker*가 종료되는 경우 *primary*가 *worker*를 다시 실행시킵니다.

# Epretx

이 프로젝트는 [Epretx](https://epretx.etri.re.kr/)의 [언어 분석 기술](https://epretx.etri.re.kr/apiDetail?id=2) API를 사용합니다.

- 사용을 원하는 경우, [Epretx](https://epretx.etri.re.kr/)에 접속하여 회원 가입 후 **API KEY**를 발급 받아 사용하실 수 있습니다.
- `.env`의 `AI_OPEN_ETRI_API_KEY` 미설정 시 해당 기능을 사용할 수 없습니다.

```dotenv
### epretx.etri.re.kr
AI_OPEN_ETRI_API_URL=http://epretx.etri.re.kr:8000/api/WiseNLU_spoken
AI_OPEN_ETRI_API_KEY=
```

# Testing

테스팅 툴로 `JEST`를 사용합니다.

- 테스트와 관련된 모든 파일은 `__tests__` 디렉토리에 존재합니다.
- 테스트는 서버가 가지는 모든 REST API를 테스트합니다.

### running

```bash
npm run test
```
