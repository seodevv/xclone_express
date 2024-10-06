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
      text += ` ${i === 0 ? '' : ','}${field.toString()}\n`;
    });
  } else {
    text += ' *\n';
  }

  text += `FROM ${table}\n`;

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
      queryConfig.text += `${i === 0 ? '' : ','} ${field.toString()}`;
    });
    queryConfig.text += ')';
  }

  queryConfig.text += ' values(';
  values.forEach((v, i) => {
    queryConfig.text += `${i === 0 ? '' : ','} $${i + 1}`;
  });
  queryConfig.text += ');';

  return queryConfig;
}

function makeUpdateField<T extends keyof Schemas>(
  table: T,
  update: { fields: (keyof Schemas[T])[]; values: any[] },
  where: Where<Schemas[T]>[]
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

  queryConfig.text += 'WHERE ';
  where.forEach(({ field, value, logic, operator }, i) => {
    queryConfig.text += `${
      i === 0 ? '' : `${logic || 'AND'} `
    }${field.toString()} ${operator || '='} $${
      queryConfig.values.length + i + 1
    }`;
    queryConfig.values.push(value);
  });

  return queryConfig;
}

function makeDeleteField<T extends keyof Schemas>(
  table: T,
  where: Where<Schemas[T]>[]
) {
  let queryConfig: RequiredQueryConfig = {
    text: `DELETE FROM ${table}`,
    values: [],
  };
  queryConfig = makeWhere(queryConfig, where);

  return queryConfig;
}

function makeWhere<T>(
  queryConfig: RequiredQueryConfig,
  where?: Where<T>[]
): RequiredQueryConfig {
  if (where && where.length !== 0) {
    queryConfig.text += 'WHERE\n';
    where.forEach(({ field, operator, value, logic }, i) => {
      queryConfig.text += `  ${
        i === 0 ? '' : `${logic || 'AND'} `
      }${field.toString()} ${operator || '='} $${i + 1}\n`;
      queryConfig.values?.push(value);
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
  where,
  order,
}: {
  table: T;
  fields?: (keyof Schemas[T])[];
  where?: Where<Schemas[T]>[];
  order?: Order<Schemas[T]>[];
}): QueryConfig => {
  const queryConfig: RequiredQueryConfig = {
    text: makeSelectField(table, fields),
    values: [],
  };

  const whereResult = makeWhere(queryConfig, where);
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
  where,
}: {
  table: T;
  where: Where<Schemas[T]>[];
}) => {
  return makeDeleteField(table, where);
};

export const selectUsersQuery = ({
  where,
  order,
}: {
  where?: Where<Schemas['users']>[];
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

  const { text, values } = makeWhere(queryConfig, where);
  queryConfig.text = text;
  queryConfig.values = values;

  queryConfig.text = makeOrder(queryConfig.text, order);

  return queryConfig;
};

export const selectPostsQuery = ({
  userId,
  parentId,
  originalId,
  followIds,
  quote,
  withPostIds,
}: {
  userId?: string;
  parentId?: number;
  originalId?: number;
  followIds?: string[];
  quote?: boolean;
  withPostIds?: number[];
}) => {
  const queryConfig: RequiredQueryConfig = {
    text: '',
    values: [],
  };

  queryConfig.text = makeSelectField('advancedPost');
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
  const where: Where<Schemas['users']>[] = [{ field: 'id', value: id }];
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

  let queryConfig = makeUpdateField('users', { fields, values }, where);

  return queryConfig;
};
