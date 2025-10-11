import { AdvancedRoomQuery } from '@/db/queries';
import {
  Schemas,
  RequiredQueryConfig,
  Where,
  Order,
  Birth,
  Verified,
} from '@/db/schema';
import { AdvancedLists } from '@/model/Lists';
import { AdvancedMessages } from '@/model/Message';
import { AdvancedRooms } from '@/model/Room';
import { AdvancedUser } from '@/model/User';
import { QueryConfig } from 'pg';

function makeSelectField<T extends keyof Schemas>(
  table: T,
  fields?: (keyof Schemas[T])[],
  isCount?: boolean
): RequiredQueryConfig['text'] {
  let text = 'SELECT\n';

  if (isCount) {
    text += '\tcount(*)\n';
  } else if (fields && fields.length !== 0) {
    fields.forEach((field, i) => {
      text += `\t${i === 0 ? '' : ','}${field.toString()}\n`;
    });
  } else {
    text += '\t*\n';
  }

  text += `FROM\n\t${table}\n`;

  return text;
}

function makeInsertField<T extends keyof Schemas>(
  table: T,
  values: any[],
  fields?: (keyof Schemas[T])[]
): RequiredQueryConfig {
  const queryConfig: RequiredQueryConfig = {
    text: `INSERT INTO ${table}`,
    values: values,
  };

  if (fields?.length !== values.length) {
    throw new Error('The number of fields and values ​​do not match.');
  }

  if (fields && fields.length !== 0) {
    queryConfig.text += '(';
    fields.forEach((field, i) => {
      queryConfig.text += `${i === 0 ? '' : ','}${field.toString()}`;
    });
    queryConfig.text += ')';
  }

  queryConfig.text += ' values(';
  values.forEach((v, i) => {
    queryConfig.text += `${i === 0 ? '' : ','}$${i + 1}`;
  });
  queryConfig.text += ') RETURNING *';

  return queryConfig;
}

function makeUpdateField<T extends keyof Schemas>(
  table: T,
  update: { fields: (keyof Schemas[T])[]; values: any[] },
  wheres: Where<Schemas[T]>[][]
) {
  const queryConfig: RequiredQueryConfig = {
    text: `UPDATE\n\t${table}\nSET`,
    values: update.values,
  };

  if (update.fields.length === 0 || update.values.length === 0) {
    throw new Error('There are no fields or values ​​to update.');
  }

  if (update.fields.length !== update.values.length) {
    throw new Error('The number of fields and values ​​do not match.');
  }

  update.fields.forEach((field, i) => {
    queryConfig.text += `${i === 0 ? '' : ','}\n\t"${field.toString()}" = $${
      i + 1
    }`;
  });
  queryConfig.text += '\n';

  const { text, values } = makeWhere(
    queryConfig,
    wheres,
    update.fields.length + 1
  );
  queryConfig.text = text;
  queryConfig.values = values;

  return queryConfig;
}

function makeDeleteField<T extends keyof Schemas>(
  table: T,
  wheres: Where<Schemas[T]>[][]
) {
  let queryConfig: RequiredQueryConfig = {
    text: `DELETE FROM ${table} `,
    values: [],
  };
  queryConfig = makeWhere(queryConfig, wheres);

  return queryConfig;
}

function makeWhere<T>(
  queryConfig: RequiredQueryConfig,
  wheres?: Where<T>[][],
  startIndex = 1
): RequiredQueryConfig {
  if (wheres && wheres.length !== 0) {
    let index = startIndex;

    let first = true;
    wheres.forEach((where, i) => {
      if (typeof where === 'undefined') return;
      if (where.length === 0) return;

      if (first) {
        queryConfig.text += 'WHERE\n';
        queryConfig.text += `\t(\n`;
        first = false;
      } else {
        queryConfig.text += `\tAND (\n`;
      }

      let second = true;
      where.forEach((v, j) => {
        if (typeof v === 'undefined') return;
        if (
          typeof v.value === 'undefined' &&
          v.operator !== 'is not null' &&
          v.operator !== 'is null'
        )
          return;
        const {
          tableAlias,
          field,
          subField,
          not,
          operator,
          subOperator,
          value,
          logic,
        } = v;
        const isParam = operator !== 'is null' && operator !== 'is not null';
        const isArray = operator === 'in' || operator === 'not in';
        const isJson = operator === '->>' || operator === '#>>';

        queryConfig.text += `\t\t${second ? '' : `${logic || 'AND'} `}${
          not ? 'NOT ' : ''
        }${tableAlias ? `${tableAlias}.` : ''}"${field.toString()}" ${
          operator || '='
        }${subField && isJson ? `'${subField}'` : ''} ${subOperator || ''} ${
          isArray ? '(' : ''
        }${
          isArray && Array.isArray(value)
            ? `${value.map(() => `$${index++}`)}`
            : isParam
            ? `$${index}`
            : ''
        }${isArray ? ')' : ''}\n`;
        second = false;

        if (isArray) {
          value.forEach((v: any) => queryConfig.values.push(v));
        } else if (isParam) {
          queryConfig.values.push(value);
          index++;
        }
      });
      queryConfig.text += '\t)\n';
    });
  }

  return queryConfig;
}

function makeOrder<T>(
  text: RequiredQueryConfig['text'],
  order?: Order<T>[]
): RequiredQueryConfig['text'] {
  if (order && order.length !== 0) {
    text += 'ORDER BY\n';
    order.forEach(({ field, operator, subField, func, by, tableAlias }, i) => {
      text += `  ${i === 0 ? '' : ','}${func ? `${func}(` : ''}${
        tableAlias ? `${tableAlias}.` : ''
      }"${field.toString()}"${func ? ')' : ''}${operator || ''}${
        subField ? `'${subField}'` : ''
      } ${by || 'ASC'}\n`;
    });
  }

  return text;
}

export function makeLimit(
  text: RequiredQueryConfig['text'],
  limit?: number
): RequiredQueryConfig['text'] {
  if (typeof limit !== 'undefined') {
    text += `LIMIT ${limit}\n`;
  }
  return text;
}

export function makeOffset(
  text: RequiredQueryConfig['text'],
  offset?: number
): RequiredQueryConfig['text'] {
  if (typeof offset !== 'undefined') {
    text += `OFFSET ${offset}\n`;
  }

  return text;
}

export const selectQuery = <T extends keyof Schemas>({
  table,
  fields,
  wheres,
  order,
  limit,
  offset,
  isCount,
}: {
  table: T;
  fields?: (keyof Schemas[T])[];
  wheres?: Where<Schemas[T]>[][];
  order?: Order<Schemas[T]>[];
  limit?: number;
  offset?: number;
  isCount?: boolean;
}): QueryConfig => {
  const queryConfig: RequiredQueryConfig = {
    text: makeSelectField(table, fields, isCount),
    values: [],
  };

  const whereResult = makeWhere(queryConfig, wheres);
  queryConfig.text = whereResult.text;
  queryConfig.values = whereResult.values;

  if (!isCount) {
    queryConfig.text = makeOrder(queryConfig.text, order);
    queryConfig.text = makeLimit(queryConfig.text, limit);
    queryConfig.text = makeOffset(queryConfig.text, offset);
  }

  return queryConfig;
};

export const insertQuery = <T extends keyof Schemas>({
  table,
  fields,
  values,
}: {
  table: T;
  fields?: (keyof Schemas[T])[];
  values: any[];
}) => {
  return makeInsertField(table, values, fields);
};

export const updateQuery = <T extends keyof Schemas>({
  table,
  update,
  wheres,
}: {
  table: T;
  update: { fields: (keyof Schemas[T])[]; values: any[] };
  wheres: Where<Schemas[T]>[][];
}) => {
  return makeUpdateField(table, update, wheres);
};

export const deleteQuery = <T extends keyof Schemas>({
  table,
  wheres,
}: {
  table: T;
  wheres: Where<Schemas[T]>[][];
}) => {
  return makeDeleteField(table, wheres);
};

export const selectListsQuery = (args: {
  sessionid: string;
  id?: Schemas['lists']['id'];
  userid?: Schemas['lists']['userid'];
  make?: Schemas['lists']['make'];
  filter?: 'all' | 'own' | 'memberships';
  q?: string;
  includeSelf?: boolean;
  relation?: 'Not Following';
  sort?: 'Follower' | 'createat';
  pagination?: {
    limit: number;
    offset: number;
  };
}) => {
  const {
    sessionid,
    id,
    userid,
    make,
    filter,
    q,
    includeSelf = true,
    relation,
    sort = 'createat',
    pagination,
  } = args;

  let queryConfig: RequiredQueryConfig = {
    text: `select
	al.id,
	al.userid,
	al."User",
	al.name,
	al.description,
	al.banner,
	al.thumbnail,
	al.make,
	al.createat,
	al."Member",
	al."Follower",
	al."UnShow",
	al."Posts",
	case
		when ld.id is not null then true
		else false
	end as "Pinned"
from
	advancedlists al
left outer join (
	select
		id,
		listid
	from
		listsdetail
	where
		type = 'pinned'
		and userid = $1) ld on
	ld.listid = al.id\n`,
    values: [sessionid],
  };

  const wheres: Where<Schemas['advancedlists']>[][] = [];
  if (typeof id !== 'undefined') {
    wheres.push([{ tableAlias: 'al', field: 'id', value: id }]);
  }

  if (typeof userid !== 'undefined') {
    switch (filter) {
      case 'all':
        wheres.push([
          { tableAlias: 'al', field: 'userid', value: userid },
          {
            logic: 'OR',
            tableAlias: 'al',
            field: 'Follower',
            operator: '@>',
            value: `[{"id":"${userid}"}]`,
          },
        ]);
        break;
      case 'memberships':
        wheres.push([
          {
            tableAlias: 'al',
            field: 'Member',
            operator: '@>',
            value: `[{"id":"${userid}"}]`,
          },
        ]);
        break;
      default:
        wheres.push([{ tableAlias: 'al', field: 'userid', value: userid }]);
        break;
    }
  }
  if (typeof make !== 'undefined') {
    wheres.push([{ tableAlias: 'al', field: 'make', value: make }]);
  }
  if (typeof q !== 'undefined') {
    wheres.push([
      {
        tableAlias: 'al',
        field: 'name',
        operator: 'ilike',
        value: `%${decodeURIComponent(q)}%`,
      },
    ]);
  }
  if (!includeSelf) {
    wheres.push([{ field: 'userid', operator: '<>', value: sessionid }]);
  }

  if (typeof relation !== 'undefined') {
    switch (relation) {
      case 'Not Following':
        wheres.push([
          {
            field: 'Follower',
            operator: '@>',
            not: true,
            value: `[{"id":"${sessionid}"}]`,
          },
        ]);
        break;
    }
  }

  queryConfig = makeWhere(queryConfig, wheres, 2);

  const order: Order<AdvancedLists>[] = [];
  switch (sort) {
    case 'Follower':
      order.push({
        func: 'jsonb_array_length',
        field: 'Follower',
        by: 'DESC',
      });
      break;
  }

  if (sessionid === userid) {
    order.push({ field: 'Pinned', by: 'DESC' });
  }
  order.push({ field: 'createat', by: 'DESC' });

  queryConfig.text = makeOrder<AdvancedLists>(queryConfig.text, order);
  queryConfig.text = makeLimit(queryConfig.text, pagination?.limit || 10);
  queryConfig.text = makeOffset(
    queryConfig.text,
    typeof pagination !== 'undefined' ? pagination.limit * pagination.offset : 0
  );

  return queryConfig;
};

export const insertUsersQuery = ({
  id,
  password,
  nickname,
  birth,
  image,
}: Pick<
  Schemas['users'],
  'id' | 'password' | 'nickname' | 'birth' | 'image'
>) => {
  const queryConfig = makeInsertField(
    'users',
    [id, password, nickname, birth ? birth : null, image],
    ['id', 'password', 'nickname', 'birth', 'image']
  );

  return queryConfig;
};

export const updateUsersQuery = ({
  id,
  nickname,
  desc,
  location,
  birth,
  refer,
  image,
  banner,
  verified,
}: {
  id: string;
  nickname?: string;
  desc?: string;
  location?: string;
  birth?: Birth | null;
  refer?: string;
  image?: string;
  banner?: string;
  verified?: Verified | null;
}) => {
  const fields: (keyof Schemas['users'])[] = [];
  const values: any[] = [];
  const wheres: Where<Schemas['users']>[][] = [[{ field: 'id', value: id }]];
  if (typeof nickname !== 'undefined') {
    fields.push('nickname');
    values.push(nickname);
  }
  if (typeof desc !== 'undefined') {
    fields.push('desc');
    values.push(desc);
  }
  if (typeof location !== 'undefined') {
    fields.push('location');
    values.push(location);
  }
  if (typeof birth !== 'undefined') {
    fields.push('birth');
    values.push(birth);
  }
  if (typeof refer !== 'undefined') {
    fields.push('refer');
    values.push(refer);
  }
  if (typeof image !== 'undefined') {
    fields.push('image');
    values.push(image);
  }
  if (typeof banner !== 'undefined') {
    fields.push('banner');
    values.push(banner !== '' ? banner : null);
  }
  if (typeof verified !== 'undefined') {
    fields.push('verified');
    values.push(verified);
  }

  let queryConfig = makeUpdateField('users', { fields, values }, wheres);

  return queryConfig;
};

export const selectAdvancedRoomListQuery = ({
  sessionid,
  roomid,
  senderid,
  receiverid,
  findUserid,
}: {
  sessionid: AdvancedUser['id'];
  roomid?: string;
  senderid?: string;
  receiverid?: string;
  findUserid?: string;
}) => {
  let queryConfig: RequiredQueryConfig = {
    text: AdvancedRoomQuery,
    values: [sessionid],
  };

  const wheres: Where<AdvancedRooms>[][] = [];
  if (typeof roomid !== 'undefined') {
    wheres.push([{ tableAlias: 'ar', field: 'id', value: roomid }]);
  }
  if (typeof senderid !== 'undefined') {
    wheres.push([{ tableAlias: 'ar', field: 'senderid', value: senderid }]);
  }
  if (typeof receiverid !== 'undefined') {
    wheres.push([{ tableAlias: 'ar', field: 'receiverid', value: receiverid }]);
  }
  if (typeof findUserid !== 'undefined') {
    wheres.push([
      { tableAlias: 'ar', field: 'receiverid', value: findUserid },
      { logic: 'OR', tableAlias: 'ar', field: 'senderid', value: findUserid },
    ]);
  }

  queryConfig = makeWhere<AdvancedRooms>(queryConfig, wheres, 2);

  return queryConfig;
};

export const selectRoomsNotification = ({
  sessionid,
}: {
  sessionid: AdvancedUser['id'];
}) => {
  let queryConfig: RequiredQueryConfig = {
    text: `select
	r.id,
	count(*)::int as "Notifications"
from
	rooms r
inner join messages m on
	m.roomid = r.id
where
	(r.senderid = $1
		or r.receiverid = $1)
	and m.senderid <> $1
	and m.seen = false
group by r.id`,
    values: [sessionid],
  };

  return queryConfig;
};

export const selectMessagesListSearch = (args: {
  sessionid: AdvancedUser['id'];
  q: AdvancedMessages['content'];
  pagination?: {
    limit: number;
    offset: number;
  };
}) => {
  const { sessionid, q, pagination } = args;

  let queryConfig: RequiredQueryConfig = {
    text: `select
	row_to_json(ar.*) as "Room",
	am.*
from
	advancedmessages am
inner join 
		(
	${AdvancedRoomQuery}) ar on
	ar.id = am.roomid\n`,
    values: [],
  };

  const wheres: Where<AdvancedMessages & AdvancedRooms>[][] = [
    [
      { tableAlias: 'ar', field: 'senderid', value: sessionid },
      { tableAlias: 'ar', logic: 'OR', field: 'receiverid', value: sessionid },
    ],
    [
      {
        tableAlias: 'am',
        field: 'content',
        operator: 'like',
        value: `%${q}%`,
      },
    ],
  ];

  queryConfig = makeWhere(queryConfig, wheres);
  queryConfig.text = makeOrder<AdvancedMessages & AdvancedRooms>(
    queryConfig.text,
    [{ tableAlias: 'am', field: 'createat', by: 'DESC' }]
  );
  queryConfig.text = makeLimit(queryConfig.text, pagination?.limit || 10);
  queryConfig.text = makeOffset(
    queryConfig.text,
    typeof pagination !== 'undefined' ? pagination.limit * pagination.offset : 0
  );

  return queryConfig;
};
