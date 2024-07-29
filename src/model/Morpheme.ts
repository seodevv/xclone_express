type Type =
  | 'NNG'
  | 'NNP'
  | 'NNB'
  | 'NP'
  | 'NR'
  | 'W'
  | 'VA'
  | 'VX'
  | 'VCP'
  | 'VCN'
  | 'MM'
  | 'MAG'
  | 'MAJ'
  | 'IC'
  | 'JKS'
  | 'JKC'
  | 'JKG'
  | 'JKB'
  | 'JKV'
  | 'JKQ'
  | 'JX'
  | 'JC'
  | 'EP'
  | 'EF'
  | 'EC'
  | 'ETN'
  | 'ETM'
  | 'XPN'
  | 'XSN'
  | 'XSV'
  | 'XSA'
  | 'XR'
  | 'SF'
  | 'SP'
  | 'SS'
  | 'SE'
  | 'SO'
  | 'SL'
  | 'SH'
  | 'SW'
  | 'NF'
  | 'NV'
  | 'SN'
  | 'NA';

interface Morp {
  id: number;
  lemma: string;
  type: Type;
  position: number;
  weight: number;
}

interface MorpEval {
  id: number;
  result: string;
  target: string;
  word_id: number;
  m_begin: number;
  m_end: number;
}

interface Word {
  id: number;
  text: string;
  type: string;
  begin: number;
  end: number;
}

interface Sentence {
  id: number;
  reserve_str: string;
  text: string;
  morp: Morp[];
  morp_eval: MorpEval[];
  WSD: any[];
  word: Word[];
  NE: any[];
  NE_Link: any[];
  chunk: any[];
  dependency: any[];
  phrase_dependency: any[];
  SRL: any[];
  relation: any[];
  SA: any[];
  ZA: any[];
}

export interface Morpheme {
  result: number;
  return_object: {
    doc_id: string;
    DCT: string;
    category: string;
    category_weight: number;
    title: {
      text: string;
      NE: string;
    };
    metaInfo: Record<string, any>;
    paragraphInfo: any[];
    sentence: Sentence[];
    entity: any[];
  };
}
