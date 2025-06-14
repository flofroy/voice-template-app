// Main React component for the voice-driven template autofill website
import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

const templates = {
  "Inspection Summary": `*** INSPECTION SUMMARY ***\n* Vehicle inspected: {{vehicle}}\n* Damages overview: {{damages}}\n* Theft recoveries: {{theft}}\n* Unrelated damages: {{unrelated}}\n* Any open items or supp?: {{supp}}\n* Parts Search/Source: {{parts}}\n* Appraisal comments: {{comments}}`
};

export default function VoiceTemplateApp() {
  const [selectedTemplate, setSelectedTemplate] = useState("Inspection Summary");
  const [filledValues, setFilledValues] = useState({});
  const [templateText, setTemplateText] = useState(templates[selectedTemplate]);
  const [isListening, setIsListening] = useState(false);
  const [savedEntries, setSavedEntries] = useState(() => JSON.parse(localStorage.getItem('voice_templates') || '{}'));
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) return;
    const recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const spoken = event.results[0][0].transcript.trim();
      handleSpeechInput(spoken);
    };

    recognition.onerror = (e) => console.error(e);
    recognitionRef.current = recognition;
  }, []);

  useEffect(() => {
    const newTemplate = templates[selectedTemplate];
    setTemplateText(applyFilledValues(newTemplate));
  }, [selectedTemplate, filledValues]);

  function applyFilledValues(template) {
    return template.replace(/\{\{(.*?)\}\}/g, (_, key) => filledValues[key] || `[${key}]`);
  }

  function handleSpeechInput(text) {
    const keys = Object.keys(templates[selectedTemplate].match(/\{\{(.*?)\}\}/g).reduce((acc, val) => {
      acc[val.replace(/[{}]/g, '')] = true;
      return acc;
    }, {}));

    const nextKey = keys.find(k => !filledValues[k]);
    if (nextKey) {
      setFilledValues(prev => ({ ...prev, [nextKey]: text }));
    }
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
  }

  function deleteSaved(name) {
    const updated = { ...savedEntries };
    delete updated[name];
    setSavedEntries(updated);
    localStorage.setItem('voice_templates', JSON.stringify(updated));
  }

  function finalizeText() {
    const text = applyFilledValues(templates[selectedTemplate]);
    fetch('https://api.openai.com/v1/engines/gpt-4/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_OPENAI_API_KEY'
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
    <div className="p-6 space-y-4">
      <Card>
        <CardContent className="space-y-2">
          <label>Select Template:</label>
          <select value={selectedTemplate} onChange={e => {
            setSelectedTemplate(e.target.value);
            setFilledValues({});
          }}>
            {Object.keys(templates).map(t => <option key={t}>{t}</option>)}
          </select>

          <Button onClick={toggleListening}>{isListening ? 'Listening...' : 'Click to Speak'}</Button>

          <Textarea readOnly value={templateText} rows={10} />

          <div className="flex items-center space-x-2">
            <Input placeholder="Name this entry" id="saveName" />
            <Button onClick={() => handleSave(document.getElementById('saveName').value)}>Save</Button>
            <Button onClick={finalizeText}>Finalize & Clean</Button>
          </div>

          <div>
            <label>Load Saved Entry:</label>
            <select onChange={(e) => loadSaved(e.target.value)}>
              <option>-- Select --</option>
              {Object.keys(savedEntries).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <Button onClick={() => deleteSaved(document.querySelector('select').value)}>Delete</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
