const { PrismaClient } = require('@prisma/client');

async function checkConstraints() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Checking database constraints...');
    
    // Check foreign key constraints on products table
    const foreignKeys = await prisma.$queryRaw`
      SELECT 
        fk.name AS constraint_name,
        tp.name AS parent_table,
        cp.name AS parent_column,
        tr.name AS referenced_table,
        cr.name AS referenced_column
      FROM sys.foreign_keys fk
      INNER JOIN sys.tables tp ON fk.parent_object_id = tp.object_id
      INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      INNER JOIN sys.columns cp ON fkc.parent_column_id = cp.column_id AND fkc.parent_object_id = cp.object_id
      INNER JOIN sys.tables tr ON fk.referenced_object_id = tr.object_id
      INNER JOIN sys.columns cr ON fkc.referenced_column_id = cr.column_id AND fkc.referenced_object_id = cr.object_id
      WHERE tp.name = 'products'
    `;
    
    console.log('Foreign key constraints on products table:', foreignKeys);
    
    // Check default constraints on products table
    const defaultConstraints = await prisma.$queryRaw`
      SELECT 
        dc.name AS constraint_name,
        c.name AS column_name,
        dc.definition
      FROM sys.default_constraints dc
      INNER JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
      INNER JOIN sys.tables t ON c.object_id = t.object_id
      WHERE t.name = 'products'
    `;
    
    console.log('Default constraints on products table:', defaultConstraints);
    
    // Check columns in products table
    const columns = await prisma.$queryRaw`
      SELECT 
        c.name AS column_name,
        t.name AS data_type,
        c.is_nullable,
        c.column_default
      FROM sys.columns c
      INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
      INNER JOIN sys.tables tb ON c.object_id = tb.object_id
      WHERE tb.name = 'products'
      ORDER BY c.column_id
    `;
    
    console.log('Columns in products table:', columns);
    
  } catch (error) {
    console.error('Error checking constraints:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkConstraints();
