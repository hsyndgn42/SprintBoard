package com.sprintboard;

import java.util.Map;

/** Works with API maps and JDBC column maps without rewriting historical snapshots. */
final class BauPolicy {
  private BauPolicy() {}
  static boolean isBau(Map<String,?> task) {
    return "BAU".equals(value(task,"taskCategory","TASK_CATEGORY"))
        || "LEAVE".equals(value(task,"workKind","WORK_KIND"))
        || "LEAVE".equals(value(task,"taskSubtype","TASK_SUBTYPE"));
  }
  private static Object value(Map<String,?> task,String api,String sql) {
    return task.containsKey(api)?task.get(api):task.get(sql);
  }
}
