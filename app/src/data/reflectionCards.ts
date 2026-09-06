import icon01 from '@/assets/reflection-cards/icon-01.png'
import icon02 from '@/assets/reflection-cards/icon-02.png'
import icon03 from '@/assets/reflection-cards/icon-03.png'
import icon04 from '@/assets/reflection-cards/icon-04.png'
import icon05 from '@/assets/reflection-cards/icon-05.png'
import icon06 from '@/assets/reflection-cards/icon-06.png'
import icon07 from '@/assets/reflection-cards/icon-07.png'
import icon08 from '@/assets/reflection-cards/icon-08.png'
import icon09 from '@/assets/reflection-cards/icon-09.png'
import icon10 from '@/assets/reflection-cards/icon-10.png'
import icon11 from '@/assets/reflection-cards/icon-11.png'
import icon12 from '@/assets/reflection-cards/icon-12.png'
import icon13 from '@/assets/reflection-cards/icon-13.png'
import icon14 from '@/assets/reflection-cards/icon-14.png'
import icon15 from '@/assets/reflection-cards/icon-15.png'
import icon16 from '@/assets/reflection-cards/icon-16.png'
import icon17 from '@/assets/reflection-cards/icon-17.png'
import icon18 from '@/assets/reflection-cards/icon-18.png'

export interface ReflectionCard {
  number: number
  title: string
  subtitle: string
  image: string
}

/**
 * The 18-topic reflection prototype grid (below the tile-row editor on
 * `TodayPage`). Static content only — no data model, no interaction — see
 * `ReflectionSection.tsx` for why these render as plain, non-interactive
 * cards. Captions are real text, never baked into the illustration crops.
 */
export const REFLECTION_CARDS: ReflectionCard[] = [
  { number: 1, title: 'Somatic', subtitle: 'Sensation, pain, release & embodiment', image: icon01 },
  { number: 2, title: 'Parts', subtitle: 'Inner parts, conflict & harmony', image: icon02 },
  { number: 3, title: 'Internal Systems', subtitle: 'HOS architecture & system interaction', image: icon03 },
  { number: 4, title: 'Environment', subtitle: 'Physical, social & energetic ecosystem', image: icon04 },
  { number: 5, title: 'Identities', subtitle: 'Roles, identities & self-concept', image: icon05 },
  { number: 6, title: 'Thoughts', subtitle: 'Rumination, intrusive, scattered & distortions', image: icon06 },
  { number: 7, title: 'Boundaries', subtitle: 'Assert, enforce, negotiate & observe', image: icon07 },
  { number: 8, title: "Couldn't ask/tell", subtitle: 'Freeze, silence, patterns & blocks', image: icon08 },
  { number: 9, title: 'Decisions', subtitle: 'Choices, indecision, inaction & clarity', image: icon09 },
  { number: 10, title: 'Need more Evidence', subtitle: 'Validation, certainty & more data', image: icon10 },
  { number: 11, title: 'Needs', subtitle: "What I need vs what's met", image: icon11 },
  { number: 12, title: 'Values', subtitle: "Alignment, others' values & value expression", image: icon12 },
  { number: 13, title: 'What Helped?', subtitle: 'Support, nourishment & elevating moments', image: icon13 },
  { number: 14, title: 'What Made it Worse?', subtitle: 'Triggers, drains & setbacks', image: icon14 },
  { number: 15, title: 'Beliefs', subtitle: "Limiting vs expanding, mine & others'", image: icon15 },
  { number: 16, title: 'Emotions', subtitle: 'Emotional state, balance & shifts', image: icon16 },
  { number: 17, title: 'Self Harm', subtitle: 'Urges, patterns, self-sabotage', image: icon17 },
  { number: 18, title: 'Self Preservation', subtitle: 'Safety, protection & resource care', image: icon18 },
]
