import { usePlaces } from '../lib/store';
import { RATING_LABEL, type Rating } from '../types/place';
import { CATEGORY_ICON } from '../types/trip';
import { Stars } from './PlaceEditor';

/** 予定を完了にしたときに「どうでしたか？」と聞く */
export default function RatingSheet({
  placeId,
  onRate,
  onLater,
  onExclude,
}: {
  placeId: string;
  onRate: (r: Rating) => void;
  onLater: () => void;
  onExclude: () => void;
}) {
  const place = usePlaces().find((p) => p.id === placeId);
  if (!place) return null;
  return (
    <div className="sheet-backdrop" onClick={onLater}>
      <div className="sheet rating-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="お気に入り度">
        <div className="sheet-body">
          <p className="muted small">行った場所として記録しました</p>
          <h3>
            {CATEGORY_ICON[place.category]} {place.title} はどうでしたか？
          </h3>
          <div className="rating-buttons">
            {([3, 2, 1] as Rating[]).map((r) => (
              <button key={r} className="btn" onClick={() => onRate(r)}>
                <Stars rating={r} /> {RATING_LABEL[r]}
              </button>
            ))}
          </div>
          <div className="row between" style={{ marginTop: 12 }}>
            <button className="link small" onClick={onExclude}>
              行きたい所リストに入れない
            </button>
            <button className="link" onClick={onLater}>
              あとで
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
