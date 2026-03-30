import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { OdooClient } from '@/lib/automation/odoo-client';
import { testEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const body = await request.json() as { type?: string };

  if (body.type === 'email') {
    const result = await testEmail();
    return NextResponse.json(result);
  }

  // Default: test Odoo connection
  try {
    const config = getConfig();
    const client = new OdooClient(config.odooUrl);
    const result = await client.testConnection(
      config.odooDatabase,
      config.odooUsername,
      config.odooPassword
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Connection test failed',
    });
  }
}
