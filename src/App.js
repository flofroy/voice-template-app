// Main React component for the voice-driven template autofill website
import React, { useState, useRef, useEffect } from 'react';

const templates = {
  "Inspection Summary": `*** INSPECTION SUMMARY ***\n* Vehicle inspected: {{vehicle}}\n* Damages overview: {{damages}}\n* Theft recoveries: {{theft}}\n* Unrelated damages: {{unrelated}}\n* Any open items or supp?: {{supp}}\n* Parts Search/Source: {{parts}}\n* Appraisal comments: {{comments}}`
};

export default function VoiceTemplateApp() {
  const [selectedTemplate, setSelectedTemplate] = useState("Inspection Summary");
  const [filledValues, setFilledValues] = useState({});
  const [templateText, setTemplateText] = useState(templates[selectedTemplate]);
  const [isListening, setIsListening] = useState(false);
  const [savedEntries, setSavedEntries] = useState(() => JSON.parse(localStorage.getItem('voice_templates') || '{}'));
  const [currentKeyIndex, setCurrentKeyIndex] = useState(0);
  const recognitionRef = useRef(null);

  const keys = Object.keys(templates[selectedTemplate].match(/\{\{(.*?)\}\}/g).reduce((acc, val) => {
    acc[val.replace(/[{}]/g, '')] = true;
    return acc;
  }, {}));

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) return;
    const recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const spoken = event.results[0][0].transcript.trim();
      handleSpeechInput(spoken);
    };

    recognition.onerror = (e) => console.error(e);
    recognition.onend = () => {
      if (isListening) recognition.start();
    };

    recognitionRef.current = recognition;
  }, [isListening]);

  useEffect(() => {
    const newTemplate = templates[selectedTemplate];
    setTemplateText(applyFilledValues(newTemplate));
  }, [selectedTemplate, filledValues]);

  function applyFilledValues(template) {
    return template.replace(/\{\{(.*?)\}\}/g, (_, key) => filledValues[key] || `[${key}]`);
  }

  function handleSpeechInput(text) {
    const command = text.trim().toLowerCase();

    if (command === 'next' || command === 'skip') {
      setCurrentKeyIndex((prev) => Math.min(prev + 1, keys.length - 1));
      return;
    }

    if (command === 'back') {
      setCurrentKeyIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (command === 'clear this field') {
      const currentKey = keys[currentKeyIndex];
      if (currentKey) {
        setFilledValues(prev => ({ ...prev, [currentKey]: '' }));
      }
      return;
    }

    if (command === 'delete last point') {
      const currentKey = keys[currentKeyIndex];
      if (currentKey && filledValues[currentKey]) {
        const lines = filledValues[currentKey].split('\n');
        lines.pop();
        setFilledValues(prev => ({ ...prev, [currentKey]: lines.join('\n') }));
      }
      return;
    }

    if (command.startsWith('go to')) {
      const targetKey = command.replace('go to', '').trim();
      const index = keys.findIndex(k => k.toLowerCase() === targetKey);
      if (index !== -1) {
        setCurrentKeyIndex(index);
      }
      return;
    }

    const currentKey = keys[currentKeyIndex];
    if (!currentKey) return;

    const segments = text.split(/next point/i).map(s => s.trim()).filter(Boolean);
    const newEntry = segments.map(s => `- ${s}`).join('\n');

    setFilledValues(prev => {
      const existing = prev[currentKey] || '';
      const updated = existing ? `${existing}\n${newEntry}` : newEntry;
      return { ...prev, [currentKey]: updated };
    });

    setCurrentKeyIndex((prev) => Math.min(prev + 1, keys.length - 1));
  }

  function toggleListening() {
    setIsListening((prev) => {
      const newVal = !prev;
      if (newVal) recognitionRef.current?.start();
      else recognitionRef.current?.stop();
      return newVal;
    });
  }

  function handleSave(name) {
    if (!name) return alert("Name required before saving");
    const data = { template: selectedTemplate, filledValues };
    const updated = { ...savedEntries, [name]: data };
    setSavedEntries(updated);
    localStorage.setItem('voice_templates', JSON.stringify(updated));
  }

  function loadSaved(name) {
    const data = savedEntries[name];
    if (!data) return;
    setSelectedTemplate(data.template);
    setFilledValues(data.filledValues);
    setCurrentKeyIndex(0);
  }

  function deleteSaved(name) {
    const updated = { ...savedEntries };
    delete updated[name];
    setSavedEntries(updated);
    localStorage.setItem('voice_templates', JSON.stringify(updated));
  }

  function finalizeText() {
    const text = applyFilledValues(templates[selectedTemplate]);
    const apiKey = process.env.OPENAI_KEY || 'YOUR_OPENAI_API_KEY';

    fetch('https://api.openai.com/v1/engines/gpt-4/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        prompt: `Fix grammar, make concise and professional:\n\n${text}`,
        max_tokens: 500,
        temperature: 0.5
      })
    })
    .then(res => res.json())
    .then(data => {
      alert("Refined Output:\n\n" + (data.choices?.[0]?.text || text));
    });
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Voice Template Autofill</h2>
      <div>
        <label>Select Template:</label>
        <select value={selectedTemplate} onChange={e => {
          setSelectedTemplate(e.target.value);
          setFilledValues({});
          setCurrentKeyIndex(0);
        }}>
          {Object.keys(templates).map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      <p><strong>Current Field:</strong> {keys[currentKeyIndex]}</p>

      <button onClick={toggleListening} style={{ margin: '10px 0' }}>
        {isListening ? '🎤 Listening...' : '🎤 Click to Speak'}
      </button>

      <textarea readOnly value={templateText} rows={10} style={{ width: '100%', marginBottom: '10px' }} />

      <div>
        <input placeholder="Name this entry" id="saveName" />
        <button onClick={() => handleSave(document.getElementById('saveName').value)}>💾 Save</button>
        <button onClick={finalizeText}>✨ Finalize & Clean</button>
      </div>

      <div style={{ marginTop: '20px' }}>
        <label>Load Saved Entry:</label>
        <select onChange={(e) => loadSaved(e.target.value)}>
          <option>-- Select --</option>
          {Object.keys(savedEntries).map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <button onClick={() => deleteSaved(document.querySelector('select').value)}>🗑 Delete</button>
      </div>
    </div>
  );
}
