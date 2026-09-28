import { Empty, TextLink } from '../components/ui.tsx';

export function NotFound() {
  return (
    <Empty>
      Diese Seite gibt es nicht. <TextLink to="/">Zur Startseite</TextLink>
    </Empty>
  );
}
