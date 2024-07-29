interface Default {
  id: number;
  title: string;
  count: number;
}

interface Row extends Default {
  type: string;
}

export interface Tag extends Default {
  type: 'tag';
}

export interface Word extends Default {
  type: 'word';
  position: number;
  weight: number;
}

export type Tags = Tag | Word;

export const isWord = (tag: Row): tag is Word => {
  return tag.type === 'word';
};

export const isTag = (tag: Row): Tag => {
  return {
    ...tag,
    type: 'tag',
  };
};
