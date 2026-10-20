import { Button, glyph, Icon, PageSection, Panel } from '../../ui';
import './Electives.css';

/** Career Navigator's way to the electives guide (/career/electives). */
export function ElectivesLink() {
  return (
    <PageSection aria-label="Year 3 electives">
      <Panel tone="inset" padding="none" className="electives-link" data-hub="career-electives-link">
        <Icon glyph={glyph.sparkle} size={24} className="electives-link__icon" />
        <p className="electives-link__text">
          <strong>Choosing your Year 3 electives?</strong> See what each one adds and where it leads, side by side.
        </p>
        <Button variant="secondary" size="sm" to="/career/electives" trailingIcon={<Icon glyph={glyph.forward} />}>
          Compare electives
        </Button>
      </Panel>
    </PageSection>
  );
}
