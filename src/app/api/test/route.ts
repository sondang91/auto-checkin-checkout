import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '@/lib/config';
import { OdooClient } from '@/lib/automation/odoo-client';
import { testEmail } from '@/lib/email';
import { addLog } from '@/lib/storage';

export async function POST(request: NextRequest) {
  const body = await request.json() as { type?: string };
  const startTime = Date.now();

  if (body.type === 'email') {
    const result = await testEmail();
    await addLog({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      action: 'test_email',
      status: result.success ? 'success' : 'failed',
      message: result.message || (result.success ? 'Email test thành công' : 'Email test thất bại'),
      executionTimeMs: Date.now() - startTime,
      randomDelayApplied: 0,
    });
    return NextResponse.json(result);
  }

  // Default: test Odoo connection
  try {
    const config = await getConfig();
    const client = new OdooClient(config.odooUrl);
    const result = await client.testConnection(
      config.odooDatabase,
      config.odooUsername,
      config.odooPassword
    );
    await addLog({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      action: 'test_odoo',
      status: result.success ? 'success' : 'failed',
      message: result.message,
      executionTimeMs: Date.now() - startTime,
      randomDelayApplied: 0,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection test failed';
    await addLog({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      action: 'test_odoo',
      status: 'failed',
      message,
      executionTimeMs: Date.now() - startTime,
      randomDelayApplied: 0,
    });
    return NextResponse.json({ success: false, message });
  }
}
