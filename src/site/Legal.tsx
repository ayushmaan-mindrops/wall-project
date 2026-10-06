import { Link } from 'react-router-dom';
import { BRAND } from './brand';
import { useConsent } from './consent';

// Template policies written for the pitch, shaped around India's Digital
// Personal Data Protection Act, 2023. Have counsel review before launch.
const UPDATED = '6 October 2026';

function Privacy() {
  return (
    <>
      <h1 className="section-title">Privacy policy</h1>
      <p className="legal-updated">Last updated {UPDATED}</p>
      <p>{BRAND.name} ("we") sells natural marble. This policy explains what personal data we collect through this website, why, and the choices you have.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details</strong> when you sign in: your mobile number, name, city, what describes you (for example homeowner or architect) and, if you give it, your email.</li>
        <li><strong>Designs and quote requests</strong> you choose to save or send: the image of your design, the slab, wall measurements and your message.</li>
        <li><strong>Technical data</strong>: a sign-in cookie and, only if you allow it, anonymous analytics. See the <Link to="/cookies">cookie policy</Link>.</li>
      </ul>

      <h2>Your photos</h2>
      <p>
        The wall visualizer runs in your browser. The photos you use stay on your device unless you do one of two things:
        save a design (we store the finished image in your account) or use the AI finish (the image of your design is sent to
        Google's Gemini service to create the photoreal version, and is not used by us for anything else).
      </p>

      <h2>Why we use it</h2>
      <ul>
        <li>To sign you in by SMS code and keep your saved designs.</li>
        <li>To prepare and send the quotes you ask for, and to call you about them.</li>
        <li>To keep the site secure and prevent misuse, such as limiting SMS codes and AI finishes.</li>
        <li>With your consent, to understand how the site is used.</li>
      </ul>
      <p>We rely on your consent, which you give by signing in or sending a request, and you can withdraw it at any time.</p>

      <h2>Who we share it with</h2>
      <p>
        Only service providers who process data for us: our SMS provider (MSG91) to send sign-in codes, Google (Gemini) for the
        AI finish, our hosting provider, and analytics if you allow it. We do not sell your data.
      </p>

      <h2>How long we keep it</h2>
      <p>Account data and designs are kept while your account is active. Quote requests are kept for up to three years for our records, unless the law requires otherwise.</p>

      <h2>Your rights</h2>
      <p>
        You can ask to see the personal data we hold about you, to correct or update it, or to have it erased, and you can
        nominate someone to exercise these rights for you. Write to our grievance officer at the address below; we'll respond
        within 30 days. If you're not satisfied, you may complain to the Data Protection Board of India.
      </p>

      <h2>Children</h2>
      <p>This site is meant for adults. We don't knowingly collect data from anyone under 18.</p>

      <h2>Contact and grievance officer</h2>
      <p>{BRAND.name}, {BRAND.showroom.address}. Phone {BRAND.showroom.phone}.</p>
    </>
  );
}

function Terms() {
  return (
    <>
      <h1 className="section-title">Terms of use</h1>
      <p className="legal-updated">Last updated {UPDATED}</p>
      <h2>The visualizer is a guide</h2>
      <p>
        Renders show how a marble could look and are not an exact representation. Natural stone varies from slab to slab, and the
        AI finish is an artistic impression that may change details. Wall measurements and slab counts are estimates; we confirm
        them on site before any order.
      </p>
      <h2>Quotes</h2>
      <p>A quote request is not an order. Prices, availability and timelines are confirmed in writing by our team.</p>
      <h2>Your content</h2>
      <p>You keep the rights to photos you upload. You confirm you're entitled to use them, and you let us store and process the designs you save so we can provide the service.</p>
      <h2>Fair use</h2>
      <p>Please don't misuse the site: no automated access, no attempts to bypass limits on SMS codes or AI finishes, and no unlawful content.</p>
      <h2>Liability</h2>
      <p>The site is provided as is. To the extent the law allows, we're not liable for indirect losses arising from its use.</p>
      <h2>Law</h2>
      <p>These terms are governed by the laws of India.</p>
    </>
  );
}

function Cookies() {
  const { openSettings } = useConsent();
  return (
    <>
      <h1 className="section-title">Cookie policy</h1>
      <p className="legal-updated">Last updated {UPDATED}</p>
      <p>Cookies are small files a website stores in your browser. We keep them to a minimum.</p>
      <table className="legal-table">
        <thead><tr><th>Cookie</th><th>Purpose</th><th>Type</th><th>Lasts</th></tr></thead>
        <tbody>
          <tr><td><code>sid</code></td><td>Keeps you signed in</td><td>Necessary</td><td>30 days</td></tr>
          <tr><td><code>mindrops_consent</code></td><td>Remembers your cookie choice</td><td>Necessary</td><td>6 months</td></tr>
          <tr><td><code>_ga</code>, <code>_ga_*</code></td><td>Anonymous visit statistics (Google Analytics), only if you allow analytics</td><td>Analytics</td><td>Up to 13 months</td></tr>
        </tbody>
      </table>
      <p>We don't use advertising cookies. The visualizer also stores downloaded models in your browser's cache so it opens faster next time; this holds no personal data.</p>
      <p><button type="button" className="btn btn-primary" onClick={openSettings}>Change cookie settings</button></p>
    </>
  );
}

export function Legal({ doc }: { doc: 'privacy' | 'terms' | 'cookies' }) {
  return (
    <article className="legal">
      <p className="legal-note">Template for the pitch. Have this reviewed by counsel before launch.</p>
      {doc === 'privacy' ? <Privacy /> : doc === 'terms' ? <Terms /> : <Cookies />}
    </article>
  );
}
