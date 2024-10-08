import {
  Schemas,
  RequiredQueryConfig,
  Where,
  Order,
  Birth,
  Verified,
} from '@/db/schema';
import { QueryConfig } from 'pg';

function makeSelectField<T extends keyof Schemas>(
  table: T,
  fields?: (keyof Schemas[T])[]
): RequiredQueryConfig['text'] {
  let text = 'SELECT\n';

  if (fields && fields.length !== 0) {
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
  queryConfig.text += ');';

  return queryConfig;
}

function makeUpdateField<T extends keyof Schemas>(
  table: T,
  update: { fields: (keyof Schemas[T])[]; values: any[] },
  wheres: Where<Schemas[T]>[][]
) {
  const queryConfig: RequiredQueryConfig = {
    text: `UPDATE ${table} SET `,
    values: update.values,
  };

  if (update.fields.length !== update.values.length) {
    throw new Error('The number of fields and values ​​do not match.');
  }

  if (update.fields.length !== 0) {
    update.fields.forEach((field, i) => {
      queryConfig.text += `${i === 0 ? '' : ','}"${field.toString()}" = $${
        i + 1
      }`;
    });
    queryConfig.text += ' ';
  }

  const { text, values } = makeWhere(queryConfig, wheres, update.fields.length);
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
    queryConfig.text += 'WHERE\n';
    wheres.forEach((where, i) => {
      if (wheres[i].length === 0) return;
      queryConfig.text += ` ${i === 0 ? '' : 'AND '}(\n`;
      where.forEach(({ field, operator, value, logic }, j) => {
        queryConfig.text += `\t${
          j === 0 ? '' : `${logic || 'AND'} `
        }${field.toString()} ${operator || '='} $${index}\n`;
        queryConfig.values?.push(value);
        index++;
      });
      queryConfig.text += ' )\n';
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
    order.forEach(({ field, by }, i) => {
      text += `  ${i === 0 ? '' : ','}${field.toString()} ${by || 'ASC'}\n`;
    });
  }

  return text;
}

export const selectQuery = <T extends keyof Schemas>({
  table,
  fields,
  wheres,
  order,
}: {
  table: T;
  fields?: (keyof Schemas[T])[];
  wheres?: Where<Schemas[T]>[][];
  order?: Order<Schemas[T]>[];
}): QueryConfig => {
  const queryConfig: RequiredQueryConfig = {
    text: makeSelectField(table, fields),
    values: [],
  };

  const whereResult = makeWhere(queryConfig, wheres);
  queryConfig.text = whereResult.text;
  queryConfig.values = whereResult.values;

  queryConfig.text = makeOrder(queryConfig.text, order);

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

export const deleteQuery = <T extends keyof Schemas>({
  table,
  wheres,
}: {
  table: T;
  wheres: Where<Schemas[T]>[][];
}) => {
  return makeDeleteField(table, wheres);
};

export const selectUsersQuery = ({
  wheres,
  order,
}: {
  wheres?: Where<Schemas['users']>[][];
  order?: Order<Schemas['users']>[];
}): RequiredQueryConfig => {
  const queryConfig: RequiredQueryConfig = {
    text: '',
    values: [],
  };

  queryConfig.text = `
select
	u.id ,
	u.nickname ,
	u.image ,
	u.banner ,
	u.desc ,
	u.location,
	u.birth ,
	u.refer ,
	u.verified ,
	u.regist ,
	case
		when follower.value is not null then follower.value
		else '[]'
	end as "Followers",
	case
		when following.value is not null then following.value
		else '[]'
	end as "Followings",
	json_build_object('Followers',
	case
		when follower.count is not null then follower.count
		else '0'
	end,
	'Followings',
	case
		when following.count is not null then following.count
		else '0'
	end
	) as _count
from
	users u
left outer join (
	select
		source,
		json_agg( row_to_json(f)::jsonb-'source') as value,
		count(*) as count
	from
		(
		select
			source,
			target as id
		from
			follow) f
	group by
		source) following on
	following.source = u.id
left outer join (
	select
		target,
		json_agg( row_to_json(f)::jsonb-'target') as value,
		count(*) as count
	from
		(
		select
			source as id,
			target
		from
			follow) f
	group by
		target) follower on
	follower.target = u.id
`;

  const { text, values } = makeWhere(queryConfig, wheres);
  queryConfig.text = text;
  queryConfig.values = values;

  queryConfig.text = makeOrder(queryConfig.text, order);

  return queryConfig;
};

export const selectPostsQuery = ({
  userid,
  parentid,
  originalid,
  followids,
  quote,
  postids,
}: {
  userid?: string;
  parentid?: number;
  originalid?: number;
  quote?: boolean;
  followids?: string[];
  postids?: number[];
}) => {
  const queryConfig: RequiredQueryConfig = {
    text: '',
    values: [],
  };
  const wheres: Where<Schemas['advancedPost']>[][] = [];
  let index = 0;

  if (typeof userid !== 'undefined') {
    wheres[index].push({ field: 'userid', value: userid });
  }
  if (typeof parentid !== 'undefined') {
    wheres[index].push({ field: 'parentid', value: parentid });
  }
  if (typeof originalid !== 'undefined') {
    wheres[index].push({ field: 'originalid', value: originalid });
  }
  if (typeof quote !== 'undefined') {
    wheres[index].push({ field: 'quote', value: quote });
  }
  if (typeof followids !== 'undefined') {
    wheres[index].push({
      field: 'userid',
      operator: 'in',
      value: followids.toString(),
    });
  }
  if (typeof postids !== 'undefined') {
    wheres[index].push({
      field: 'postid',
      operator: 'in',
      value: postids.toString(),
    });
  }

  queryConfig.text = makeSelectField('advancedPost');
  const { text, values } = makeWhere(queryConfig, wheres);
  queryConfig.text = text;
  queryConfig.values = values;

  return queryConfig;
};

export const selectListsQuery = ({
  sessionid,
  userid,
  make,
  filter,
}: {
  sessionid: string;
  userid?: string;
  make?: Schemas['lists']['make'];
  filter?: 'all' | 'own' | 'memberships';
}) => {
  let queryConfig: RequiredQueryConfig = {
    text: '',
    values: [sessionid],
  };

  queryConfig.text = `
select
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
	ld.listid = al.id
`;

  const wheres: Where<Schemas['advancedLists']>[][] = [];
  let index = 0;
  if (typeof userid !== 'undefined') {
    wheres[index].push({ field: 'userid', value: userid });
  }
  if (typeof make !== 'undefined') {
    wheres[index].push({ field: 'make', value: make });
  }

  if (filter === 'all') {
    const { text, values } = makeWhere(queryConfig, wheres, 2);
    queryConfig.text = text;
    queryConfig.values = values;

    queryConfig.text += `\tOR al."Follower"::text like $${
      queryConfig.values.length + 1
    }\n`;
    queryConfig.values.push(`%"${userid}"%`);
  } else if (filter === 'own' || typeof filter === 'undefined') {
    const { text, values } = makeWhere(queryConfig, wheres, 2);
    queryConfig.text = text;
    queryConfig.values = values;
  } else if (filter === 'memberships') {
    queryConfig.text += 'WHERE\n';
    queryConfig.text += `\tal."Member"::text like $${
      queryConfig.values.length + 1
    }\n`;
    queryConfig.values.push(`%"${userid}"%`);
  }

  queryConfig.text += 'ORDER BY\n';
  if (sessionid === userid) {
    queryConfig.text += '\t"Pinned" desc,\n';
  }
  queryConfig.text += '\tcreateat desc\n';

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
  verified?: Verified;
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
