import { SCHEMA_NAME } from '@/db/env';
import {
  DatabaseError,
  Pool,
  PoolClient,
  QueryConfig,
  QueryResultRow,
} from 'pg';

let settingSearchPath = false;
export async function safeQuery<T extends QueryResultRow>(
  client: Pool | PoolClient,
  queryConfig: QueryConfig
) {
  try {
    if (!settingSearchPath) {
      await client.query(`SET search_path To ${SCHEMA_NAME}, public`);
      settingSearchPath = true;
    }
    return await client.query<T>(queryConfig);
  } catch (err) {
    const wrapped: Error & { cause?: Error } = new Error(`${queryConfig.text}`);
    wrapped.cause = err as DatabaseError;
    Error.captureStackTrace(wrapped, safeQuery);
    throw wrapped;
  }
}

export const AdvancedRoomQuery = `select
	ar.id as id,
	ar.receiverid as receiverid,
	ar."Receiver" as "Receiver",
	ar.senderid as senderid,
	ar."Sender" as "Sender",
	ar.createat as createat,
	m.id as lastmessageid,
	m.lastmessagesenderid as lastmessagesenderid,
	m."type" as type,
	m."content" as content,
	m.lastat as lastat,
	ar.sent as sent,
	case
		when rd_pin.roomid is null then false
		else true
	end as "Pinned",
	case
		when rd_disable.roomid is null then false
		else true
	end as "Disabled",
	case
		when
		rs_snooze.roomid is null then null
		else jsonb_build_object('type', rs_snooze."type", 'createat', rs_snooze.createat )
	end as "Snooze"
from
	advancedrooms ar
left join (
	select
		max_m.roomid,
		m.id,
		m.senderid as lastmessagesenderid,
		mm."type" ,
		m."content",
		m.createat as lastat
	from
		messages m
	left outer join messagesmedia mm on
		mm.messageid = m.id
	inner join (
		select
			m.roomid,
			max(m.id) as messageid
		from
			messages m
		left outer join (
			select
				s_md."type",
				s_md.messageid,
				s_md.userid
			from
				messagesdetail s_md
			where
				s_md."type" = 'disable'
				and s_md.userid = $1 ) md on
			md.messageid = m.id
		where
			md."type" is null
		group by
			m.roomid) max_m on
		max_m.messageid = m.id) m on
	m.roomid = ar.id
left outer join (
	select
		s_rd.roomid
	from
		roomsdetail s_rd
	where
		s_rd.type = 'pin'
		and s_rd.userid = $1) rd_pin on
	rd_pin.roomid = ar.id
left outer join (
	select
		s_rd.roomid
	from
		roomsdetail s_rd
	where
		s_rd.type = 'disable'
		and s_rd.userid = $1) rd_disable on
	rd_disable.roomid = ar.id
left outer join (
	select
		s_rs."type" ,
		s_rs.roomid,
		s_rs.createat
	from
		roomssnooze s_rs
	where
		s_rs.userid = $1) rs_snooze on
	rs_snooze.roomid = ar.id\n`;
