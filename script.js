const chapterMap = [
  { id: 'world', title: '세계관 역사' },
  { id: 'characters', title: '캐릭터 정보' },
  { id: 'events', title: '주요 이벤트' }
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

function parseEvents(lines) {
  const events = [];
  let current = null;
  let resultMode = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (/^###\s*.*배경/.test(line)) break;
    if (/^##\s*커맨드 입력 이벤트/.test(line)) break;
    const eventHeading = line.match(/^\[([^\]]+)\]$/);
    if (eventHeading) {
      current = { name: eventHeading[1], time: '무관', condition: '무관', content: '무관', results: [] };
      events.push(current);
      resultMode = false;
      continue;
    }
    if (!current || !line || line.startsWith('#')) continue;
    const cleaned = cleanLine(line);
    if (/^결과\s*$/.test(cleaned)) {
      resultMode = true;
      continue;
    }
    const field = splitField(cleaned);
    if (field) {
      if (field.label === '시기') current.time = field.value || '무관';
      else if (field.label === '발생조건') current.condition = field.value || '무관';
      else if (field.label === '내용') current.content = field.value || '무관';
      else if (['결과', '성공시', '실패시'].includes(field.label)) {
        current.results.push(`${field.label}: ${field.value}`);
        resultMode = true;
      } else if (resultMode) {
        current.results.push(cleaned);
      }
    } else if (resultMode) {
      current.results.push(cleaned);
    }
  }
  for (const event of events) {
    if (!event.results.length) event.results.push('무관');
  }
  return events;
}

function parseCommands(lines) {
  const groups = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^###\s*.*배경/.test(line)) break;
    const heading = line.match(/^###\s*(.+목록)\s*$/);
    if (heading) {
      current = { heading: heading[1], commands: [] };
      groups.push(current);
      continue;
    }
    if (current && /^-\s*!/.test(line)) current.commands.push(cleanLine(line));
  }
  return groups;
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

function eventHTML(event) {
  return `<article class="event-card">
    <h3>${escapeHTML(event.name)}</h3>
    <dl class="event-fields">
      <div><dt>시기</dt><dd>${escapeHTML(event.time)}</dd></div>
      <div><dt>발생조건</dt><dd>${escapeHTML(event.condition)}</dd></div>
      <div><dt>내용</dt><dd>${escapeHTML(event.content)}</dd></div>
      <div><dt>결과</dt><dd>${event.results.map(result => `<p>${escapeHTML(result)}</p>`).join('')}</dd></div>
    </dl>
  </article>`;
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
    const events = parseEvents(lines.slice(eventStart));
    const commands = parseCommands(lines.slice(eventStart));

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
        <div class="event-list">${events.map(eventHTML).join('')}</div>
        ${commands.map(group => `<section class="command-group"><h3>${escapeHTML(group.heading)}</h3><div>${group.commands.map(command => `<code>${escapeHTML(command)}</code>`).join('')}</div></section>`).join('')}
      </section>`;
  })
  .catch(error => {
    document.querySelector('#content').innerHTML = `<p class="error">${escapeHTML(error.message)}<br>GitHub Pages 또는 로컬 서버에서 열어주세요.</p>`;
  });
