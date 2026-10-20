// A free picture as it shows on its page: its kept part filling its box (stretched when its shape was changed),
// turned about its middle, with its caption under it. The same view is on the pages, in the pages drawer and in the
// export, so a picture is in the same place in all three.
import { useState } from 'react';
import { useFileHref } from '../files';
import type { Rect } from '../text/picture';
import type { FreePicture } from './geometry';
import { boxStyle } from './style';
import { Icon, glyph } from '../../../ui';

/** The part of a picture kept (`crop`), filling a box `w` × `h` units. */
export function Cropped({
  upload,
  alt,
  crop,
  w,
  h,
}: {
  upload: string;
  alt: string;
  crop: Rect;
  w: number;
  h: number;
}) {
  const [broken, setBroken] = useState(false);
  const fileHref = useFileHref();
  if (broken) {
    return (
      <span className="nb-free__frame nb-free__broken" role="img" aria-label="This picture isn’t available any more">
        <Icon glyph={glyph.imageBroken} aria-hidden="true" />
      </span>
    );
  }
  const iw = w / crop.w;
  const ih = h / crop.h;
  return (
    <span className="nb-free__frame">
      <img
        src={fileHref(upload)}
        alt={alt}
        draggable={false}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={{ width: iw, height: ih, left: -crop.x * iw, top: -crop.y * ih }}
      />
    </span>
  );
}

/** A free picture drawn where it is on its sheet, as the pages drawer and the export show it (spans only: it may be
 *  inside a button). */
export function FreePictureView({ p }: { p: FreePicture }) {
  return (
    <span className="nb-free" style={boxStyle(p)}>
      <Cropped upload={p.upload} alt={p.alt} crop={p.crop} w={p.w} h={p.h} />
      {p.caption ? <span className="nb-free__caption">{p.caption}</span> : null}
    </span>
  );
}
