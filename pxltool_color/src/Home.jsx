import React from 'react';

const Home = () => {
  return (
    <div className="p-8">
      {/* --- СЮДА ВСТАВЛЯЙ КОД ИЗ СТАРОГО HTML --- */}
      {/* Важно: Если в старом коде есть class="...", переименуй в className="..." */}
      
      <h1 className="text-3xl font-bold mb-4">Мой сайт</h1>
      <p className="mb-4">Это моя главная страница.</p>

      {/* --- КНОПКА ДЛЯ ПЕРЕХОДА В ТУЛ --- */}
      <a 
        href="/tool" 
        className="inline-block bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition"
      >
        Открыть Pixel Tool →
      </a>
      
    </div>
  );
};

export default Home;