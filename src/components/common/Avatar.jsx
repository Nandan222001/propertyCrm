import React from 'react';

export function Avatar({ name, i = 0 }) {
  return (
    <div className={`avatar avatar-${['peach', 'mint', 'lilac', 'sky', 'rose'][i % 5]}`}>
      {(name || 'NA').split(' ').slice(0, 2).map(x => x[0]).join('')}
    </div>
  );
}
