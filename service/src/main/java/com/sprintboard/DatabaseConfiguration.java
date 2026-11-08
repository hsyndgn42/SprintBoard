package com.sprintboard;

import java.util.Locale;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.ColumnMapRowMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.util.LinkedCaseInsensitiveMap;

@Configuration(proxyBeanMethods = false)
public class DatabaseConfiguration {
  @Bean
  JdbcTemplate jdbcTemplate(DataSource dataSource) {
    return new JdbcTemplate(dataSource) {
      @Override
      protected RowMapper<Map<String, Object>> getColumnMapRowMapper() {
        return new ColumnMapRowMapper() {
          @Override
          protected Map<String, Object> createColumnMap(int columnCount) {
            // SQL identifiers are not natural-language text. Turkish casing turns ID into
            // ıd, making lookups such as row.get("id") silently miss H2's uppercase labels.
            // Keep the original keys and all values; only key comparison uses a fixed locale.
            return new LinkedCaseInsensitiveMap<>(columnCount, Locale.ROOT);
          }
        };
      }
    };
  }
}
