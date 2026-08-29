const chapterMap = [
  { id: 'world', title: '세계관 역사' },
  { id: 'characters', title: '캐릭터 정보' },
  { id: 'events', title: '이벤트' }
];

const portraitMap = {
  '소헌대비': '01', '혜빈 김씨': '02', '숙빈 신씨': '03', '정혜공주': '04',
  '명희왕후': '05', '츠키노미야 천황': '06', '효혜의황후': '07', '옥귀비': '08',
  '김성국': '09', '김성재': '10', '신헌': '11', '이웅': '12', '이재': '13', '건륭제': '14'
};

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

function cleanLine(line) {
  return line.trim().replace(/^[-·]\s*/, '').trim();
}

function splitField(line) {
  const match = cleanLine(line).match(/^([^:：]{1,28})[:：]\s*(.*)$/);
  return match ? { label: match[1].trim(), value: match[2].trim() } : null;
}

function normalizeHonorific(label, value) {
  const normalizedLabel = label.replace(/\s/g, '');
  const normalizedValue = value.trim();
  if (normalizedValue.toLowerCase() === 'x' || !normalizedValue) {
    return { label: '봉호', value: 'x' };
  }
  if (['존호', '봉호', '호'].includes(normalizedLabel)) {
    return { label: normalizedLabel, value: normalizedValue };
  }
  return { label: '봉호', value: normalizedValue };
}

function findSectionIndex(lines, pattern) {
  return lines.findIndex(line => pattern.test(line.trim()));
}

function parseWorld(lines) {
  const records = [];
  let current = { heading: '세계관 개요', lines: [] };
  records.push(current);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^#\s*세계관/.test(line)) continue;
    const heading = line.match(/^#{2,3}\s*(.+)$/);
    if (heading) {
      current = { heading: heading[1].trim(), lines: [] };
      records.push(current);
      continue;
    }
    current.lines.push(cleanLine(line));
  }
  return records.filter(record => record.lines.length);
}

function parseCharacters(lines) {
  const characters = [];
  let current = null;
  let maleMode = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^#\s*등장인물/.test(line)) continue;
    const heading = line.match(/^##\s*(.+)$/);
    if (heading) {
      maleMode = heading[1].trim() === '남자캐릭터';
      current = maleMode ? null : { name: heading[1].trim(), fields: [] };
      if (current) characters.push(current);
      continue;
    }

    if (maleMode && line.includes('|') && !/양식[:：]/.test(line)) {
      const fields = cleanLine(line).split('|').map(value => value.trim());
      const title = splitField(fields[4] || '');
      const honorific = title
        ? normalizeHonorific(title.label, title.value)
        : { label: '봉호', value: 'x' };
      const character = {
        name: fields[0],
        fields: [
          { label: '성별', value: fields[2] || '무관' },
          { label: '생년', value: fields[3] || '무관' },
          honorific,
          { label: '신분', value: fields[5] || '무관' },
          { label: '성격', value: fields[6] || '무관' }
        ]
      };
      if (fields[7]) character.fields.push({ label: '외형', value: fields[7] });
      if (fields[8]) character.fields.push({ label: '말투', value: fields[8] });
      if (fields[9]) character.fields.push({ label: '말투 예시', value: fields[9] });
      characters.push(character);
      continue;
    }

    if (current) {
      const field = splitField(line);
      if (!field || field.label === '양식' || field.label === '호칭') continue;
      current.fields.push(field);
    }
  }

  for (const character of characters) {
    const titleIndex = character.fields.findIndex(field => ['존호', '봉호', '호'].includes(field.label));
    if (titleIndex >= 0) {
      character.fields[titleIndex] = normalizeHonorific(
        character.fields[titleIndex].label,
        character.fields[titleIndex].value
      );
    } else {
      const birthIndex = character.fields.findIndex(field => field.label === '생년');
      character.fields.splice(birthIndex + 1, 0, { label: '봉호', value: 'x' });
    }
  }
  return characters;
}

function parseCharacterDetails(lines, characters) {
  const details = Object.fromEntries(characters.map(character => [character.name, { background: [], detail: [] }]));
  const namesByKey = new Map(characters.map(character => [character.name.replace(/\s/g, ''), character.name]));
  let currentName = null;
  let mode = null;

  for (const raw of lines) {
    const line = raw.trim();
    const backgroundHeading = line.match(/^###\s*(.*?)\s*배경(?:\s*&\s*상세설정)?\s*$/);
    if (backgroundHeading) {
      currentName = namesByKey.get(backgroundHeading[1].replace(/\s/g, '')) || null;
      mode = /&\s*상세설정/.test(line) ? 'detail' : 'background';
      continue;
    }
    if (/^###\s*세부\s*설정/.test(line)) {
      mode = 'detail';
      continue;
    }
    if (currentName && mode && line && !line.startsWith('#')) {
      details[currentName][mode].push(cleanLine(line));
    }
  }
  return details;
}

function parseAutomaticEvents(lines) {
  const events = [];
  let current = null;
  let inSection = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s*커맨드 비입력 이벤트/.test(line)) {
      inSection = true;
      continue;
    }
    if (/^##\s*커맨드 입력 이벤트/.test(line)) break;
    if (!inSection) continue;

    const eventHeading = line.match(/^\[([^\]]+)\]$/);
    if (eventHeading) {
      current = { name: eventHeading[1].trim(), lines: [] };
      events.push(current);
      continue;
    }
    if (!current || !line || line.startsWith('#')) continue;
    current.lines.push(cleanLine(line));
  }
  return events;
}

function parseCommandEvents(lines) {
  const events = [];
  let current = null;
  let group = '주요 이벤트';
  let inSection = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (/^###\s*.*배경/.test(line)) break;
    if (/^##\s*커맨드 입력 이벤트/.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection || !line) continue;

    const groupHeading = line.match(/^###\s*(.+?)\s*목록\s*$/);
    if (groupHeading) {
      group = groupHeading[1].trim();
      current = null;
      continue;
    }

    const cleaned = cleanLine(line);
    const commandMatch = cleaned.match(/^(![^:：\s]+)(?:[:：]\s*(.*))?$/);
    if (commandMatch) {
      current = {
        name: commandMatch[1].slice(1),
        command: commandMatch[1],
        group,
        lines: commandMatch[2] ? [`설명: ${commandMatch[2]}`] : []
      };
      events.push(current);
      continue;
    }

    if (!current) continue;
    const eventHeading = line.match(/^###\s*(.+)$/);
    if (eventHeading) continue;
    if (cleaned.replace(/\s/g, '') === current.name.replace(/\s/g, '')) continue;
    current.lines.push(cleaned);
  }
  return events;
}

function fieldsHTML(fields) {
  return fields.map(field => `<p><strong>${escapeHTML(field.label)}</strong> · ${escapeHTML(field.value)}</p>`).join('');
}

function worldHTML(records) {
  return records.map(record => `<details class="fold-card world-record">
    <summary>${escapeHTML(record.heading)}</summary>
    <div class="fold-body">${record.lines.map(line => {
      const field = splitField(line);
      return field
        ? `<p><strong>${escapeHTML(field.label)}</strong> · ${escapeHTML(field.value)}</p>`
        : `<p>${escapeHTML(line)}</p>`;
    }).join('')}</div>
  </details>`).join('');
}

function characterHTML(character, extra) {
  const portrait = portraitMap[character.name];
  const hasExtra = extra && (extra.background.length || extra.detail.length);
  return `<article class="record character-record">
    ${portrait
      ? `<img class="portrait" src="assets/characters/${portrait}.png" alt="${escapeHTML(character.name)} 초상화">`
      : `<div class="portrait portrait-empty" aria-hidden="true">肖像 未備</div>`}
    <div class="character-content">
      <h3>${escapeHTML(character.name)}</h3>
      <div class="profile-fields">${fieldsHTML(character.fields)}</div>
      ${hasExtra ? `<details class="fold-card character-detail">
        <summary>배경 &amp; 상세설정 보기</summary>
        <div class="fold-body">
          ${extra.background.length ? `<h4>배경</h4><p>${escapeHTML(extra.background.join(' '))}</p>` : ''}
          ${extra.detail.length ? `<h4>상세설정</h4><p>${escapeHTML(extra.detail.join(' '))}</p>` : ''}
        </div>
      </details>` : ''}
    </div>
  </article>`;
}

function eventLinesHTML(lines) {
  return lines.map(line => {
    const field = splitField(line);
    if (field) {
      return `<div class="event-field"><strong>${escapeHTML(field.label)}</strong><p>${escapeHTML(field.value)}</p></div>`;
    }
    const isHeading = /^(실행조건|결과)$/.test(line);
    return `<p class="event-note${isHeading ? ' event-note-heading' : ''}">${escapeHTML(line)}</p>`;
  }).join('');
}

function eventHTML(event) {
  return `<details class="fold-card event-card">
    <summary>
      <span>${escapeHTML(event.name)}</span>
      ${event.command ? `<code>${escapeHTML(event.command)}</code>` : ''}
    </summary>
    <div class="fold-body event-fields">${eventLinesHTML(event.lines)}</div>
  </details>`;
}

function commandEventsHTML(events) {
  const groups = [...new Set(events.map(event => event.group))];
  return groups.map(group => `<section class="event-command-group">
    <h4>${escapeHTML(group)}</h4>
    <div class="event-list">${events.filter(event => event.group === group).map(eventHTML).join('')}</div>
  </section>`).join('');
}

fetch('settings.txt')
  .then(response => {
    if (!response.ok) throw new Error('설정 파일을 불러오지 못했습니다.');
    return response.text();
  })
  .then(text => {
    const lines = text.replace(/\r/g, '').split('\n');
    const characterStart = findSectionIndex(lines, /^#\s*등장인물/);
    const eventStart = findSectionIndex(lines, /^#\s*이벤트/);
    const world = parseWorld(lines.slice(0, characterStart));
    const characters = parseCharacters(lines.slice(characterStart, eventStart));
    const details = parseCharacterDetails(lines.slice(eventStart), characters);
    const automaticEvents = parseAutomaticEvents(lines.slice(eventStart));
    const commandEvents = parseCommandEvents(lines.slice(eventStart));

    document.querySelector('#content').innerHTML = `
      <section class="chapter" id="world">
        <h2 class="chapter-title">${chapterMap[0].title}</h2>
        <p class="chapter-guide">항목을 누르면 해당 기록이 펼쳐집니다.</p>
        <div class="world-list">${worldHTML(world)}</div>
      </section>
      <section class="chapter" id="characters">
        <h2 class="chapter-title">${chapterMap[1].title}</h2>
        ${characters.map(character => characterHTML(character, details[character.name])).join('')}
      </section>
      <section class="chapter" id="events">
        <h2 class="chapter-title">${chapterMap[2].title}</h2>
        <section class="event-category">
          <h3 class="event-type-title">커맨드 비입력 이벤트</h3>
          <p class="chapter-guide">시기에 도달하면 자동으로 발생합니다. 이벤트를 누르면 설명이 펼쳐집니다.</p>
          <div class="event-list">${automaticEvents.map(eventHTML).join('')}</div>
        </section>
        <section class="event-category">
          <h3 class="event-type-title">커맨드 입력 이벤트</h3>
          <p class="chapter-guide">해당 커맨드를 입력했을 때만 발동합니다. 이벤트를 누르면 설명이 펼쳐집니다.</p>
          ${commandEventsHTML(commandEvents)}
        </section>
      </section>`;
  })
  .catch(error => {
    document.querySelector('#content').innerHTML = `<p class="error">${escapeHTML(error.message)}<br>GitHub Pages 또는 로컬 서버에서 열어주세요.</p>`;
  });
