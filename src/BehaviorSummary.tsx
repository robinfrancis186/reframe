import type { FeatureSpec } from './model';

export const operations: Record<string, string> = {
  unresolved: 'Define behavior…',
  create: 'Save a new record',
  update: 'Update selected record',
  delete: 'Delete selected record',
  search: 'Search saved records',
  toggle: 'Persist an on/off state',
  increment: 'Increment a counter',
  navigate: 'Navigate to a destination',
  details: 'Show authored details',
  reset: 'Clear input fields',
  signin: 'Sign in with email/password',
  signup: 'Create an account',
  signout: 'Sign out',
  external: 'Call an external API',
};
export default function BehaviorSummary({ spec }: { spec: FeatureSpec }) {
  return (
    <div className="behavior-summary" aria-label="Included behavior">
      <ul>
        {spec.actions.map((action) => (
          <li key={action.id}>
            <strong>{action.label}</strong> →{' '}
            {operations[action.operation] ||
              (action.operation === 'product-details'
                ? 'Show product details'
                : action.operation === 'product-options'
                  ? 'Choose options and add to cart'
                  : action.operation)}
            {action.operation === 'navigate' && <>: {action.target}</>}
            {action.operation === 'details' && <>: {action.message}</>}
            {action.operation === 'external' && (
              <>
                : {action.connection?.method} {action.connection?.url}
              </>
            )}
          </li>
        ))}
      </ul>
      {!!spec.fields.length && (
        <p>
          Inputs:{' '}
          {spec.fields
            .map((f) => `${f.label}${f.required ? ' (required)' : ' (optional)'}`)
            .join(', ')}
          .
        </p>
      )}
      <p>
        {spec.authRequired
          ? 'Sign-in required. Saved records belong to each account.'
          : 'No sign-in required. Saved records are shared by everyone using this installation.'}{' '}
        Records stay on the computer running the backend.
      </p>
      {spec.actions.some((a) => a.operation === 'create') && (
        <p>
          Saving a record does not send an email or subscribe someone to a mailing service. Connect
          an external API for that.
        </p>
      )}
      {spec.actions.some((a) => a.operation === 'external') && (
        <p>
          Users supply their API key after installation. External calls cannot be tested in the
          isolated preview.
        </p>
      )}
    </div>
  );
}
