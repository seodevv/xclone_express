# xclone_express

이 프로젝트는 [Nextjs](https://github.com/seodevv/xclone) 웹 어플리케이션이 기반이 되는 백엔드 어플리케이션입니다.

- **Typescript**를 기반으로 작성되었으며, `express`로 **REST API**가 구현되어 있습니다.

- 웹 어플리케이션의 채팅을 위해 `/messages` 네임스페이스를 가지는 `socket.io` 서버도 함께 올라갑니다.

- **node**의 `cluster`를 사용 중입니다. `.env` 파일의 `MAX_WORKER`의 수를 지정해주면 하나의 *primary*와 `n`의 *worker*가 구동됩니다.(`MAX_WORKER`가 서버가 보유한 **cpus**보다 높은 경우 **cpus** 수량만큼 *worker*가 구동됩니다.)

- 데이터베이스는 [postgresql 16](https://www.postgresql.org/)을 사용하며, `.env` 파일에 접속 정보를 넣으면 서버가 최초로 실행될 때 필요한 DDL을 자동 생성합니다.

- 이 어플리케이션은 [Epretx](https://epretx.etri.re.kr/)의 [언어 분석 기술](https://epretx.etri.re.kr/apiDetail?id=2) API를 사용합니다. 사용을 원하는 경우 `.env` 파일의 `AI_OPEN_ETRI_API_KEY`의 정보를 넣으면 해당 기능을 사용할 수 있습니다.

# Started

## required environment

- .env

```dotenv
PGUSER=xclone
PGPASSWORD=xclone
PGHOST=localhost
PGPORT=5432
PGDATABASE=xclone
PGSCHEMA=xclone_schema
```

이 어플리케이션은 Postgresql 16을 기반으로 구동됩니다. 따라서 Postgresql DB의 **접속 정보**를 필요로 합니다.

## development

```bash
npm run dev
```

## production

```
npm run build && npm run start
```
