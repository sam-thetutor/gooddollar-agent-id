import { GOODBUILDERS_S4_VOTING_URL } from "../lib/good-voting.js";

type GoodVotingCardProps = {
  className?: string;
};

export function GoodVotingCard({ className }: GoodVotingCardProps) {
  const rootClass = ["lp-vote-card", "lp-reveal", className]
    .filter(Boolean)
    .join(" ");

  return (
    <a
      href={GOODBUILDERS_S4_VOTING_URL}
      target="_blank"
      rel="noreferrer"
      className={rootClass}
      aria-label="Vote for GoodAgent on GoodBuilders Season 4"
    >
      <span className="lp-vote-sheen" aria-hidden />
      <div className="lp-vote-main">
        <p className="lp-vote-kicker">
          <span className="lp-vote-live" aria-hidden />
          Season 4 · Good Voting
        </p>
        <h2 className="lp-vote-title">
          Cast your vote for
          <br />
          <span className="lp-gradient-text">GoodAgent</span>
        </h2>
        <p className="lp-vote-lede">
          GoodBuilders Season 4 sends G$ to the projects the community
          backs. One wallet signature on Flow State keeps human-backed
          agent identity in the stream.
        </p>
        <ul className="lp-vote-meta">
          <li>1 signature</li>
          <li>Free to vote</li>
          <li>On Celo</li>
        </ul>
      </div>
      <div className="lp-vote-stub" aria-hidden>
        <span className="lp-vote-s4">S4</span>
        <span className="btn btn-primary btn-lg lp-vote-btn">Vote now ↗</span>
        <span className="lp-vote-hint">Opens Flow State</span>
      </div>
    </a>
  );
}
