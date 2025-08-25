import { NextResponse } from 'next/server';
import { PythonShell } from 'python-shell';

export async function POST(request: Request) {
  const body = await request.json(); // 从app接收参数、bounds、objective（如果是自定义）
  // 准备Python输入（e.g., JSON.stringify(body)）
  const options = {
    mode: 'text',
    pythonOptions: ['-u'],
    scriptPath: './', // 脚本路径
    args: [JSON.stringify(body)] // 传参
  };

  try {
    const results = await PythonShell.run('贝叶斯制剂样子.py', options);
    return NextResponse.json({ output: results.join('\n') });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}