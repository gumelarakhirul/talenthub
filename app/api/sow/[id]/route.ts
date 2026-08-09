import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(req: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const { sow_nama } = await req.json();

    const data = await prisma.mst_sow.update({
      where: { sow_id: parseInt(id) },
      data: {
        sow_nama,
        modiby: session.user.name || "admin",
        modidate: new Date(),
      },
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Gagal update SOW" }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;

    await prisma.mst_sow.update({
      where: { sow_id: parseInt(id) },
      data: {
        sow_status: 0,
        modiby: session.user.name || "admin",
        modidate: new Date(),
      },
    });

    return NextResponse.json({ success: true, message: "SOW berhasil dinonaktifkan" });
  } catch (error) {
    return NextResponse.json({ error: "Gagal menghapus SOW" }, { status: 500 });
  }
}